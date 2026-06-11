import type { RouteAlternative, TripPlan } from '../api';

const OSRM_BASE = 'https://router.project-osrm.org';

type OsrmStep = {
  distance: number;
  name?: string;
  maneuver: {
    location: [number, number];
    type: string;
    modifier?: string;
  };
};

type OsrmRoute = {
  distance: number;
  duration: number;
  geometry: string;
  legs: Array<{ distance: number; duration: number; steps: OsrmStep[] }>;
};

function decodePolyline(encoded: string): Array<{ lat: number; lon: number }> {
  const points: Array<{ lat: number; lon: number }> = [];
  let index = 0;
  let lat = 0;
  let lon = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lon += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ lat: lat / 1e5, lon: lon / 1e5 });
  }
  return points;
}

function osrmManeuverMessage(step: OsrmStep): string {
  const street = step.name?.trim() ?? '';
  const { type, modifier } = step.maneuver;
  const modMap: Record<string, string> = {
    left: 'à esquerda',
    right: 'à direita',
    'slight left': 'levemente à esquerda',
    'slight right': 'levemente à direita',
    'sharp left': 'acentuadamente à esquerda',
    'sharp right': 'acentuadamente à direita',
    straight: 'em frente',
    uturn: 'retorno',
  };
  const mod = modifier ? modMap[modifier] ?? modifier : '';

  switch (type) {
    case 'depart':
      return street ? `Siga por ${street}` : 'Inicie a rota';
    case 'arrive':
      return 'Chegada ao destino';
    case 'roundabout':
      return street ? `Rotatória — saia em ${street}` : 'Rotatória';
    case 'merge':
      return street ? `Entre em ${street}` : 'Entre na via';
    case 'fork':
      return mod ? `Na bifurcação, siga ${mod}` : 'Na bifurcação, siga em frente';
    case 'turn':
    case 'continue':
    case 'end of road':
      if (mod && street) return `Vire ${mod} em ${street}`;
      if (mod) return `Vire ${mod}`;
      return street ? `Continue em ${street}` : 'Continue em frente';
    default:
      return street ? `Siga em ${street}` : 'Continue em frente';
  }
}

function parseOsrmRoute(route: OsrmRoute) {
  const allPoints = decodePolyline(route.geometry);
  const instructions: TripPlan['route']['instructions'] = [];

  for (const leg of route.legs ?? []) {
    for (const step of leg.steps ?? []) {
      const [lon, lat] = step.maneuver.location;
      const message = osrmManeuverMessage(step);
      const mod = step.maneuver.modifier?.trim().replace(/\s+/g, '-');
      const instructionType = mod ? `${step.maneuver.type}-${mod}` : step.maneuver.type;
      if (message.length > 2) {
        instructions.push({
          message,
          lat,
          lon,
          distanceMeters: step.distance ?? 0,
          instructionType,
        });
      }
    }
  }

  return {
    legs: [
      {
        summary: {
          lengthInMeters: route.distance,
          travelTimeInSeconds: route.duration,
        },
        points: allPoints,
      },
    ],
    totalDistanceKm: route.distance / 1000,
    totalDurationMinutes: Math.round(route.duration / 60),
    instructions,
  };
}

async function fetchOsrmRoute(
  originLat: number,
  originLon: number,
  destLat: number,
  destLon: number,
  waypoints: Array<{ lat: number; lon: number }> = []
): Promise<OsrmRoute> {
  const parts = [
    `${originLon},${originLat}`,
    ...waypoints.map((w) => `${w.lon},${w.lat}`),
    `${destLon},${destLat}`,
  ];
  const url = new URL(`${OSRM_BASE}/route/v1/driving/${parts.join(';')}`);
  url.searchParams.set('overview', 'full');
  url.searchParams.set('geometries', 'polyline');
  url.searchParams.set('steps', 'true');
  url.searchParams.set('alternatives', 'false');

  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`Rota OSRM falhou (${res.status})`);
  }
  const data = (await res.json()) as { routes?: OsrmRoute[]; code?: string; message?: string };
  if (data.code !== 'Ok' || !data.routes?.[0]) {
    throw new Error(data.message ?? 'Nenhuma rota encontrada');
  }
  return data.routes[0];
}

function computeFuelAlert(remainingFuelKm: number, reserveKm: number) {
  const warningThreshold = reserveKm + 80;
  const criticalThreshold = reserveKm + 30;
  let status: 'ok' | 'warning' | 'critical' = 'ok';
  let message = `Autonomia restante: ${Math.round(remainingFuelKm)} km`;
  if (remainingFuelKm <= criticalThreshold) {
    status = 'critical';
    message = `CRÍTICO: apenas ${Math.round(remainingFuelKm)} km de autonomia! Abasteça imediatamente.`;
  } else if (remainingFuelKm <= warningThreshold) {
    status = 'warning';
    message = `Atenção: ${Math.round(remainingFuelKm)} km restantes. Considere abastecer em breve.`;
  }
  return { remainingKm: remainingFuelKm, status, message };
}

function computeScheduledStops(totalDurationMinutes: number, stopIntervalMinutes: number) {
  const stops: Array<{ type: string; message: string; minutesUntil: number }> = [];
  for (let t = stopIntervalMinutes; t < totalDurationMinutes; t += stopIntervalMinutes) {
    stops.push({
      type: 'scheduled',
      message: 'Parada programada — descanso recomendado',
      minutesUntil: t,
    });
  }
  return stops;
}

/** Planejamento direto via OSRM no browser — fallback quando a API Render falha. */
export async function planTripDirect(params: {
  originLat: number;
  originLon: number;
  destination: string;
  destinationLat?: number;
  destinationLon?: number;
  destinationLocationTag?: string;
  waypoints?: Array<{ lat: number; lon: number }>;
  currentFuelKm: number;
  fuelReserveKm: number;
  stopIntervalMinutes: number;
}): Promise<TripPlan> {
  const destLat = params.destinationLat;
  const destLon = params.destinationLon;
  if (destLat == null || destLon == null || !Number.isFinite(destLat) || !Number.isFinite(destLon)) {
    throw new Error('Destino sem coordenadas — selecione um endereço da lista.');
  }

  const waypoints = (params.waypoints ?? []).filter((w) => w.lat && w.lon);
  const osrmRoute = await fetchOsrmRoute(
    params.originLat,
    params.originLon,
    destLat,
    destLon,
    waypoints
  );
  const route = parseOsrmRoute(osrmRoute);

  const alternative: RouteAlternative = {
    id: 'direct',
    kind: 'with_tolls',
    label: 'Rota sugerida',
    hasTolls: false,
    tollCount: 0,
    tollCostEstimateBrl: null,
    ...route,
  };

  return {
    origin: { lat: params.originLat, lon: params.originLon },
    destination: {
      lat: destLat,
      lon: destLon,
      address: params.destinationLocationTag ?? params.destination,
      locationTag: params.destinationLocationTag,
    },
    waypoints,
    route,
    routeAlternatives: [alternative],
    selectedRouteId: 'direct',
    pois: [],
    roadAlerts: [],
    fuelAlert: computeFuelAlert(params.currentFuelKm, params.fuelReserveKm),
    scheduledStops: computeScheduledStops(route.totalDurationMinutes, params.stopIntervalMinutes),
  };
}
