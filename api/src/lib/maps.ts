const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const PHOTON_BASE = 'https://photon.komoot.io';
/** Limita buscas ao Brasil (Photon não aceita lang=pt). */
const PHOTON_BR_BBOX = '-73.99,-33.75,-34.79,5.27';
const OSRM_BASE = 'https://router.project-osrm.org';
const OVERPASS_ENDPOINTS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
];

const USER_AGENT = 'DriveNavigator/1.0 (free-stack; openstreetmap)';

export interface GeocodeResult {
  lat: number;
  lon: number;
  formattedAddress: string;
}

export async function geocodeAddress(query: string): Promise<GeocodeResult | null> {
  const url = new URL(`${NOMINATIM_BASE}/search`);
  url.searchParams.set('q', query.trim());
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'br');
  url.searchParams.set('addressdetails', '1');

  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Geocoding falhou: ${res.status}`);
  }

  const data = (await res.json()) as Array<{
    lat: string;
    lon: string;
    display_name: string;
  }>;

  const first = data[0];
  if (!first) return null;

  return {
    lat: Number(first.lat),
    lon: Number(first.lon),
    formattedAddress: first.display_name,
  };
}

export interface AddressSuggestion {
  id: string;
  label: string;
  placeName: string;
  city: string;
  stateCode: string;
  locationTag: string;
  address: string;
  lat: number;
  lon: number;
}

interface AddressFields {
  freeformAddress?: string;
  municipality?: string;
  municipalitySubdivision?: string;
  countrySubdivision?: string;
  countrySubdivisionCode?: string;
  countrySubdivisionName?: string;
  localName?: string;
}

function normalizeStateCode(code?: string, subdivision?: string): string {
  if (code?.trim()) {
    return code.trim().toUpperCase().replace(/^BR-/, '');
  }
  const map: Record<string, string> = {
    'acre': 'AC', 'alagoas': 'AL', 'amapá': 'AP', 'amapa': 'AP', 'amazonas': 'AM',
    'bahia': 'BA', 'ceará': 'CE', 'ceara': 'CE', 'distrito federal': 'DF',
    'espírito santo': 'ES', 'espirito santo': 'ES', 'goiás': 'GO', 'goias': 'GO',
    'maranhão': 'MA', 'maranhao': 'MA', 'mato grosso': 'MT', 'mato grosso do sul': 'MS',
    'minas gerais': 'MG', 'pará': 'PA', 'para': 'PA', 'paraíba': 'PB', 'paraiba': 'PB',
    'paraná': 'PR', 'parana': 'PR', 'pernambuco': 'PE', 'piauí': 'PI', 'piaui': 'PI',
    'rio de janeiro': 'RJ', 'rio grande do norte': 'RN', 'rio grande do sul': 'RS',
    'rondônia': 'RO', 'rondonia': 'RO', 'roraima': 'RR', 'santa catarina': 'SC',
    'são paulo': 'SP', 'sao paulo': 'SP', 'sergipe': 'SE', 'tocantins': 'TO',
  };
  const key = subdivision?.trim().toLowerCase();
  return key ? map[key] ?? '' : '';
}

export function formatLocationTag(address?: AddressFields, placeName?: string): string {
  if (!address) return '';

  const stateCode = normalizeStateCode(address.countrySubdivisionCode, address.countrySubdivision);
  const city = address.municipality?.trim() ?? '';
  const district = address.municipalitySubdivision?.trim() ?? '';
  const name = placeName?.trim() ?? city;

  if (district && city && district.toLowerCase() !== city.toLowerCase() && district.toLowerCase() !== name.toLowerCase()) {
    return stateCode ? `${district} — ${city}/${stateCode}` : `${district} — ${city}`;
  }

  if (city && stateCode) {
    return `${city}/${stateCode}`;
  }

  if (name && stateCode) {
    return `${name}/${stateCode}`;
  }

  return address.freeformAddress ?? city ?? name;
}

function buildSuggestionLabel(placeName: string, locationTag: string, poiName?: string): string {
  if (poiName) {
    return locationTag ? `${poiName} — ${locationTag}` : poiName;
  }
  return locationTag || placeName;
}

export function parseAddressSuggestion(r: {
  id: string;
  type: string;
  address?: AddressFields;
  poi?: { name: string };
  position: { lat: number; lon: number };
}): AddressSuggestion {
  const addr = r.address;
  const poiName = r.poi?.name?.trim();
  const city = addr?.municipality?.trim() ?? '';
  const district = addr?.municipalitySubdivision?.trim() ?? '';
  const stateCode = normalizeStateCode(addr?.countrySubdivisionCode, addr?.countrySubdivision);

  let placeName = poiName || city || district || addr?.freeformAddress?.split(',')[0]?.trim() || 'Destino';

  if (!poiName && district && city && district.toLowerCase() !== city.toLowerCase()) {
    placeName = district;
  }

  const locationTag = formatLocationTag(addr, placeName);
  const label = buildSuggestionLabel(placeName, locationTag, poiName);
  const freeform = addr?.freeformAddress ?? label;

  return {
    id: r.id,
    label,
    placeName,
    city: city || placeName,
    stateCode,
    locationTag,
    address: freeform,
    lat: r.position.lat,
    lon: r.position.lon,
  };
}

function photonStateCode(state?: string): string {
  if (!state?.trim()) return '';
  const normalized = state.trim();
  if (normalized.length === 2) return normalized.toUpperCase();
  return normalizeStateCode(undefined, normalized);
}

function parsePhotonFeature(f: {
  geometry: { coordinates: [number, number] };
  properties: Record<string, string | number | undefined>;
}): AddressSuggestion {
  const [lon, lat] = f.geometry.coordinates;
  const props = f.properties;
  const name = String(props.name ?? props.street ?? props.city ?? 'Destino').trim();
  const city = String(props.city ?? props.county ?? '').trim();
  const district = String(props.district ?? props.locality ?? '').trim();
  const stateCode = photonStateCode(String(props.state ?? ''));
  const address: AddressFields = {
    freeformAddress: [name, props.street, city, stateCode].filter(Boolean).join(', '),
    municipality: city,
    municipalitySubdivision: district,
    countrySubdivision: String(props.state ?? ''),
    countrySubdivisionCode: stateCode,
  };
  const id = String(props.osm_id ?? `${lat.toFixed(5)}-${lon.toFixed(5)}`);
  return parseAddressSuggestion({
    id,
    type: String(props.osm_value ?? props.type ?? 'place'),
    address,
    position: { lat, lon },
  });
}

export async function searchAddressSuggestions(
  query: string,
  options?: { lat?: number; lon?: number; limit?: number }
): Promise<AddressSuggestion[]> {
  if (query.trim().length < 3) return [];

  const url = new URL(`${PHOTON_BASE}/api/`);
  url.searchParams.set('q', query.trim());
  url.searchParams.set('limit', String(options?.limit ?? 8));
  url.searchParams.set('bbox', PHOTON_BR_BBOX);
  if (options?.lat !== undefined && options?.lon !== undefined) {
    url.searchParams.set('lat', String(options.lat));
    url.searchParams.set('lon', String(options.lon));
  }

  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
  });
  if (!res.ok) return [];

  const data = (await res.json()) as {
    features?: Array<{
      geometry: { coordinates: [number, number] };
      properties: Record<string, string | number | undefined>;
    }>;
  };

  return (data.features ?? [])
    .filter((f) => {
      const cc = String(f.properties.countrycode ?? f.properties.country ?? '').toUpperCase();
      return !cc || cc === 'BR';
    })
    .map(parsePhotonFeature);
}

export interface RouteWaypoint {
  lat: number;
  lon: number;
}

export interface RouteOptions {
  originLat: number;
  originLon: number;
  destLat: number;
  destLon: number;
  waypoints?: RouteWaypoint[];
}

function buildOsrmCoordinates(options: RouteOptions): string {
  const parts = [
    `${options.originLon},${options.originLat}`,
    ...(options.waypoints?.map((w) => `${w.lon},${w.lat}`) ?? []),
    `${options.destLon},${options.destLat}`,
  ];
  return parts.join(';');
}

export interface RouteInstruction {
  message: string;
  lat: number;
  lon: number;
  distanceMeters: number;
  instructionType?: string;
}

export interface RoadAlert {
  id: string;
  type: 'radar' | 'lombada' | 'perigo';
  lat: number;
  lon: number;
  label: string;
}

export interface RouteData {
  legs: Array<{
    summary: { lengthInMeters: number; travelTimeInSeconds: number };
    points: Array<{ lat: number; lon: number }>;
  }>;
  totalDistanceKm: number;
  totalDurationMinutes: number;
  boundingBox?: {
    northEast: { lat: number; lon: number };
    southWest: { lat: number; lon: number };
  };
  instructions?: RouteInstruction[];
}

export type RouteKind = 'with_tolls' | 'no_tolls';

export interface RouteAlternative extends RouteData {
  id: string;
  kind: RouteKind;
  label: string;
  hasTolls: boolean;
  tollCount: number;
  tollCostEstimateBrl: number | null;
}

const AVG_TOLL_BRL = 14;

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

    const deltaLat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += deltaLat;

    shift = 0;
    result = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLon = result & 1 ? ~(result >> 1) : result >> 1;
    lon += deltaLon;

    points.push({ lat: lat / 1e5, lon: lon / 1e5 });
  }

  return points;
}

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
  legs: Array<{
    distance: number;
    duration: number;
    steps: OsrmStep[];
  }>;
};

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

function boundingBoxFromPoints(points: Array<{ lat: number; lon: number }>) {
  if (points.length === 0) return undefined;
  let minLat = points[0].lat;
  let maxLat = points[0].lat;
  let minLon = points[0].lon;
  let maxLon = points[0].lon;
  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLon = Math.min(minLon, p.lon);
    maxLon = Math.max(maxLon, p.lon);
  }
  return {
    northEast: { lat: maxLat, lon: maxLon },
    southWest: { lat: minLat, lon: minLon },
  };
}

function parseOsrmRoute(route: OsrmRoute): RouteData {
  const allPoints = decodePolyline(route.geometry);
  const instructions: RouteInstruction[] = [];

  for (const leg of route.legs ?? []) {
    for (const step of leg.steps ?? []) {
      const [lon, lat] = step.maneuver.location;
      const message = osrmManeuverMessage(step);
      if (message.length > 2) {
        instructions.push({
          message,
          lat,
          lon,
          distanceMeters: step.distance ?? 0,
          instructionType: step.maneuver.type,
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
    boundingBox: boundingBoxFromPoints(allPoints),
    instructions,
  };
}

async function fetchOsrmRoutes(options: RouteOptions): Promise<OsrmRoute[]> {
  const coords = buildOsrmCoordinates(options);
  const url = new URL(`${OSRM_BASE}/route/v1/driving/${coords}`);
  url.searchParams.set('overview', 'full');
  url.searchParams.set('geometries', 'polyline');
  url.searchParams.set('steps', 'true');
  url.searchParams.set('alternatives', 'true');
  url.searchParams.set('language', 'pt');

  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Rota falhou: ${res.status} — ${text}`);
  }

  const data = (await res.json()) as { routes?: OsrmRoute[]; code?: string; message?: string };
  if (data.code !== 'Ok' || !data.routes?.length) {
    throw new Error(data.message ?? 'Nenhuma rota encontrada');
  }
  return data.routes;
}

async function countTollsOnRoute(points: Array<{ lat: number; lon: number }>): Promise<number> {
  if (points.length < 2) return 0;
  const samples = sampleAlongRoute(points, Math.min(8, sampleCountForRoute(points)));
  const clauses = samples.map((p) => {
    const lat = p.lat.toFixed(5);
    const lon = p.lon.toFixed(5);
    return `node(around:800,${lat},${lon})["barrier"="toll_booth"];`;
  });
  const query = `[out:json][timeout:15];\n(\n  ${clauses.join('\n  ')}\n);\nout center;`;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': USER_AGENT,
          Accept: 'application/json',
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!res.ok) continue;
      const data = (await res.json()) as { elements?: Array<{ id: number }> };
      const ids = new Set((data.elements ?? []).map((e) => e.id));
      return ids.size;
    } catch {
      continue;
    }
  }
  return 0;
}

function buildRouteAlternative(
  id: string,
  kind: RouteKind,
  label: string,
  osrmRoute: OsrmRoute,
  tollCount: number,
  forceNoTolls = false
): RouteAlternative {
  const parsed = parseOsrmRoute(osrmRoute);
  const effectiveTolls = forceNoTolls ? 0 : tollCount;
  const hasTolls = !forceNoTolls && effectiveTolls > 0;

  return {
    id,
    kind,
    label,
    ...parsed,
    hasTolls,
    tollCount: effectiveTolls,
    tollCostEstimateBrl: hasTolls ? effectiveTolls * AVG_TOLL_BRL : null,
  };
}

function routesAreSimilar(a: RouteAlternative, b: RouteAlternative): boolean {
  return (
    Math.abs(a.totalDistanceKm - b.totalDistanceKm) < 4 &&
    Math.abs(a.totalDurationMinutes - b.totalDurationMinutes) < 8
  );
}

export async function calculateRouteAlternatives(
  options: RouteOptions
): Promise<{ alternatives: RouteAlternative[]; defaultId: string }> {
  const routes = await fetchOsrmRoutes(options);
  const primary = routes[0];
  const primaryPoints = decodePolyline(primary.geometry);
  const primaryTolls = await countTollsOnRoute(primaryPoints);

  const withTolls = buildRouteAlternative('with_tolls', 'with_tolls', 'Com pedágios', primary, primaryTolls);
  const alternatives: RouteAlternative[] = [withTolls];

  for (let i = 1; i < routes.length; i++) {
    const altRoute = routes[i];
    const altPoints = decodePolyline(altRoute.geometry);
    const altTolls = await countTollsOnRoute(altPoints);
    const candidate = buildRouteAlternative(
      altTolls < primaryTolls ? 'no_tolls' : `alt_${i}`,
      altTolls < primaryTolls ? 'no_tolls' : 'with_tolls',
      altTolls < primaryTolls ? 'Sem pedágios' : `Alternativa ${i}`,
      altRoute,
      altTolls,
      altTolls === 0
    );
    if (!routesAreSimilar(withTolls, candidate)) {
      alternatives.push(candidate);
    }
  }

  alternatives.sort((a, b) => a.totalDurationMinutes - b.totalDurationMinutes);
  const defaultId = alternatives[0]?.id ?? 'with_tolls';
  return { alternatives, defaultId };
}

export async function calculateRoute(options: RouteOptions): Promise<RouteData> {
  const { alternatives, defaultId } = await calculateRouteAlternatives(options);
  const selected = alternatives.find((a) => a.id === defaultId) ?? alternatives[0];
  if (!selected) {
    throw new Error('Nenhuma rota encontrada');
  }
  const { id: _id, kind: _k, label: _l, hasTolls: _h, tollCount: _t, tollCostEstimateBrl: _c, ...route } = selected;
  return route;
}

export type PoiCategory = 'fuel' | 'food' | 'hotel';

export const DEFAULT_POI_CATEGORIES: PoiCategory[] = ['fuel', 'hotel', 'food'];

export const POI_CATEGORY_LABELS: Record<PoiCategory, string> = {
  fuel: 'Postos de combustível',
  hotel: 'Hotéis / Pousadas',
  food: 'Restaurantes / Lanchonetes',
};

export interface PoiItem {
  id: string;
  name: string;
  category: PoiCategory;
  lat: number;
  lon: number;
  address?: string;
  distanceMeters?: number;
  distanceFromRouteKm?: number;
}

const POI_OVERPASS_FILTERS: Record<PoiCategory, string[]> = {
  fuel: ['node["amenity"="fuel"]', 'node["shop"="gas"]'],
  food: [
    'node["amenity"="restaurant"]',
    'node["amenity"="fast_food"]',
    'node["amenity"="cafe"]',
  ],
  hotel: [
    'node["tourism"="hotel"]',
    'node["tourism"="motel"]',
    'node["tourism"="guest_house"]',
  ],
};

const CATEGORY_KEYWORDS: Record<PoiCategory, string[]> = {
  fuel: ['petrol', 'gas station', 'fuel', 'posto', 'combust'],
  food: ['restaurant', 'fast food', 'café', 'cafe', 'food', 'snack', 'lanchonete', 'pizzaria', 'grill', 'bakery'],
  hotel: ['hotel', 'motel', 'guest house', 'pousada', 'lodging', 'hostel', 'resort', 'inn'],
};

const CATEGORY_REJECT_KEYWORDS: Record<PoiCategory, string[]> = {
  fuel: ['car rental', 'rent a car', 'car repair', 'car dealer', 'locadora'],
  food: ['hospital', 'clinic', 'police', 'government office', 'health care'],
  hotel: ['apartment complex', 'residential accommodation', 'condominium', 'hospital', 'police', 'government'],
};

function matchesCategory(poi: { name: string; tags?: Record<string, string> }, category: PoiCategory): boolean {
  const text = `${poi.name} ${Object.values(poi.tags ?? {}).join(' ')}`.toLowerCase();
  if (/alamo|enterprise|hertz|localiza|movida|unidas|avis|budget|rent a car|locadora/i.test(text) && category === 'fuel') {
    return false;
  }
  if (CATEGORY_REJECT_KEYWORDS[category].some((kw) => text.includes(kw))) return false;
  return CATEGORY_KEYWORDS[category].some((kw) => text.includes(kw.toLowerCase())) || text.length > 0;
}

async function fetchNearbyOverpass(
  lat: number,
  lon: number,
  category: PoiCategory,
  radiusMeters: number
): Promise<PoiItem[]> {
  const latS = lat.toFixed(5);
  const lonS = lon.toFixed(5);
  const filters = POI_OVERPASS_FILTERS[category];
  const clauses = filters.map((f) => `${f}(around:${radiusMeters},${latS},${lonS});`);
  const query = `[out:json][timeout:12];\n(\n  ${clauses.join('\n  ')}\n);\nout center tags;`;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': USER_AGENT,
          Accept: 'application/json',
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!res.ok) continue;

      const data = (await res.json()) as {
        elements?: Array<{
          id: number;
          lat?: number;
          lon?: number;
          center?: { lat: number; lon: number };
          tags?: Record<string, string>;
        }>;
      };

      const results: PoiItem[] = [];
      for (const el of data.elements ?? []) {
        const elLat = el.lat ?? el.center?.lat;
        const elLon = el.lon ?? el.center?.lon;
        if (elLat == null || elLon == null) continue;
        const tags = el.tags ?? {};
        const name = tags.name ?? tags.brand ?? tags.operator ?? 'Sem nome';
        if (!matchesCategory({ name, tags }, category)) continue;
        const addressParts = [tags['addr:street'], tags['addr:city'], tags['addr:state']].filter(Boolean);
        results.push({
          id: String(el.id),
          name,
          category,
          lat: elLat,
          lon: elLon,
          address: addressParts.length ? addressParts.join(', ') : undefined,
          distanceMeters: haversineKm(lat, lon, elLat, elLon) * 1000,
        });
      }
      return results;
    } catch {
      continue;
    }
  }
  return [];
}

export async function searchNearbyPois(
  lat: number,
  lon: number,
  category: PoiCategory,
  radiusMeters = 1200
): Promise<PoiItem[]> {
  const results = await fetchNearbyOverpass(lat, lon, category, radiusMeters);
  const seen = new Set<string>();
  return results.filter((poi) => {
    if (seen.has(poi.id)) return false;
    seen.add(poi.id);
    return true;
  });
}

export async function searchPoisAlongRoute(
  routePoints: Array<{ lat: number; lon: number }>,
  categories: PoiCategory[] = DEFAULT_POI_CATEGORIES
): Promise<PoiItem[]> {
  if (routePoints.length === 0) return [];

  const sampleStep = Math.max(1, Math.floor(routePoints.length / 12));
  const samplePoints = routePoints.filter((_, i) => i % sampleStep === 0);

  const batches = await Promise.all(
    samplePoints.flatMap((point) =>
      categories.map((category) => searchNearbyPois(point.lat, point.lon, category, 1200))
    )
  );

  const allPois: PoiItem[] = [];
  const seen = new Set<string>();
  for (const batch of batches) {
    for (const poi of batch) {
      if (!seen.has(poi.id)) {
        seen.add(poi.id);
        allPois.push(poi);
      }
    }
  }

  return filterPoisOnRoute(allPois, routePoints);
}

export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Distancia maxima (km) de um POI em relacao a linha da rota */
const ROUTE_CORRIDOR_KM = 0.35;

function projectOnSegment(
  p: { lat: number; lon: number },
  a: { lat: number; lon: number },
  b: { lat: number; lon: number }
): { lat: number; lon: number } {
  const dx = b.lon - a.lon;
  const dy = b.lat - a.lat;
  const t = Math.max(
    0,
    Math.min(1, ((p.lon - a.lon) * dx + (p.lat - a.lat) * dy) / (dx * dx + dy * dy + 1e-12))
  );
  return { lat: a.lat + t * dy, lon: a.lon + t * dx };
}

function pointToSegmentDistanceKm(
  p: { lat: number; lon: number },
  a: { lat: number; lon: number },
  b: { lat: number; lon: number }
): number {
  const proj = projectOnSegment(p, a, b);
  return haversineKm(p.lat, p.lon, proj.lat, proj.lon);
}

function snapPointToRoute(
  point: { lat: number; lon: number },
  routePoints: Array<{ lat: number; lon: number }>
): { lat: number; lon: number; distanceKm: number } {
  if (routePoints.length === 0) {
    return { lat: point.lat, lon: point.lon, distanceKm: Infinity };
  }
  if (routePoints.length === 1) {
    const d = haversineKm(point.lat, point.lon, routePoints[0].lat, routePoints[0].lon);
    return { lat: routePoints[0].lat, lon: routePoints[0].lon, distanceKm: d };
  }

  let bestLat = routePoints[0].lat;
  let bestLon = routePoints[0].lon;
  let minD = Infinity;
  const step = routePoints.length > 3000 ? 3 : routePoints.length > 1000 ? 2 : 1;

  for (let i = 0; i < routePoints.length - step; i += step) {
    const proj = projectOnSegment(point, routePoints[i], routePoints[i + step]);
    const d = haversineKm(point.lat, point.lon, proj.lat, proj.lon);
    if (d < minD) {
      minD = d;
      bestLat = proj.lat;
      bestLon = proj.lon;
    }
  }

  return { lat: bestLat, lon: bestLon, distanceKm: minD };
}

export function distanceToRouteKm(
  point: { lat: number; lon: number },
  routePoints: Array<{ lat: number; lon: number }>
): number {
  if (routePoints.length === 0) return Infinity;
  if (routePoints.length === 1) {
    return haversineKm(point.lat, point.lon, routePoints[0].lat, routePoints[0].lon);
  }

  let min = Infinity;
  const step = routePoints.length > 3000 ? 3 : routePoints.length > 1000 ? 2 : 1;

  for (let i = 0; i < routePoints.length - step; i += step) {
    const d = pointToSegmentDistanceKm(point, routePoints[i], routePoints[i + step]);
    if (d < min) min = d;
  }
  return min;
}

export function filterPoisOnRoute(
  pois: PoiItem[],
  routePoints: Array<{ lat: number; lon: number }>,
  maxDistanceKm = ROUTE_CORRIDOR_KM
): PoiItem[] {
  return pois
    .map((poi) => ({
      ...poi,
      distanceFromRouteKm: distanceToRouteKm(poi, routePoints),
    }))
    .filter((poi) => poi.distanceFromRouteKm <= maxDistanceKm)
    .sort((a, b) => (a.distanceFromRouteKm ?? 0) - (b.distanceFromRouteKm ?? 0));
}

const ALERT_CORRIDOR_KM = 0.28;
const OVERPASS_RADIUS_M = 2800;
const OVERPASS_SAMPLES = 12;
const OVERPASS_BATCH_SIZE = 2;

const OVERPASS_HEADERS = {
  'Content-Type': 'application/x-www-form-urlencoded',
  'User-Agent': USER_AGENT,
  Accept: 'application/json',
};

function routeLengthKmFromPoints(routePoints: Array<{ lat: number; lon: number }>): number {
  if (routePoints.length < 2) return 0;
  let km = 0;
  for (let i = 1; i < routePoints.length; i++) {
    km += haversineKm(
      routePoints[i - 1].lat,
      routePoints[i - 1].lon,
      routePoints[i].lat,
      routePoints[i].lon
    );
  }
  return km;
}

function sampleCountForRoute(routePoints: Array<{ lat: number; lon: number }>): number {
  const km = routeLengthKmFromPoints(routePoints);
  return Math.min(50, Math.max(OVERPASS_SAMPLES, Math.ceil(km / 20)));
}

function sampleAlongRoute(
  routePoints: Array<{ lat: number; lon: number }>,
  maxSamples = OVERPASS_SAMPLES
): Array<{ lat: number; lon: number }> {
  if (routePoints.length <= maxSamples) return routePoints;
  const result: Array<{ lat: number; lon: number }> = [];
  const step = (routePoints.length - 1) / (maxSamples - 1);
  for (let i = 0; i < maxSamples; i++) {
    const idx = Math.min(Math.round(i * step), routePoints.length - 1);
    result.push(routePoints[idx]);
  }
  return result;
}

function buildSampledOverpassQuery(samples: Array<{ lat: number; lon: number }>): string {
  const clauses: string[] = [];
  for (const p of samples) {
    const lat = p.lat.toFixed(5);
    const lon = p.lon.toFixed(5);
    clauses.push(`node(around:${OVERPASS_RADIUS_M},${lat},${lon})["highway"="speed_camera"];`);
    clauses.push(`node(around:${OVERPASS_RADIUS_M},${lat},${lon})["enforcement"="maxspeed"];`);
    clauses.push(`node(around:${OVERPASS_RADIUS_M},${lat},${lon})["traffic_calming"];`);
    clauses.push(`way(around:${OVERPASS_RADIUS_M},${lat},${lon})["traffic_calming"];`);
    clauses.push(`node(around:${OVERPASS_RADIUS_M},${lat},${lon})["man_made"="surveillance"]["surveillance:type"="speed"];`);
  }
  return `[out:json][timeout:25];\n(\n  ${clauses.join('\n  ')}\n);\nout center;`;
}

function parseAlertTags(
  el: { id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> },
  seen: Set<string>,
  lat: number,
  lon: number
): RoadAlert | null {
  const tags = el.tags ?? {};
  let type: RoadAlert['type'] | null = null;
  let label = '';

  if (
    tags.highway === 'speed_camera' ||
    tags.enforcement === 'maxspeed' ||
    (tags.man_made === 'surveillance' && tags['surveillance:type'] === 'speed')
  ) {
    type = 'radar';
    label = 'Radar';
  } else if (tags.traffic_calming) {
    type = 'lombada';
    const tc = tags.traffic_calming;
    label = tc === 'hump' || tc === 'bump' || tc === 'table' ? 'Lombada' : `Redutor (${tc})`;
  }

  if (!type) return null;

  const key = `${type}-${lat.toFixed(5)}-${lon.toFixed(5)}`;
  if (seen.has(key)) return null;
  seen.add(key);

  return { id: String(el.id), type, lat, lon, label };
}

function parseAlertElement(
  el: { id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> },
  routePoints: Array<{ lat: number; lon: number }>,
  seen: Set<string>
): RoadAlert | null {
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (lat == null || lon == null) return null;

  const snapped = snapPointToRoute({ lat, lon }, routePoints);
  if (snapped.distanceKm > ALERT_CORRIDOR_KM) return null;

  return parseAlertTags(el, seen, snapped.lat, snapped.lon);
}

function buildNearPointOverpassQuery(lat: number, lon: number, radiusM: number): string {
  const latS = lat.toFixed(5);
  const lonS = lon.toFixed(5);
  return `[out:json][timeout:12];
(
  node(around:${radiusM},${latS},${lonS})["highway"="speed_camera"];
  node(around:${radiusM},${latS},${lonS})["enforcement"="maxspeed"];
  node(around:${radiusM},${latS},${lonS})["traffic_calming"];
  way(around:${radiusM},${latS},${lonS})["traffic_calming"];
  node(around:${radiusM},${latS},${lonS})["man_made"="surveillance"]["surveillance:type"="speed"];
);
out center;`;
}

export async function searchRoadAlertsNearPoint(
  lat: number,
  lon: number,
  radiusM = 3500
): Promise<RoadAlert[]> {
  const query = buildNearPointOverpassQuery(lat, lon, radiusM);

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 11000);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: OVERPASS_HEADERS,
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!res.ok) continue;

      const data = (await res.json()) as {
        elements?: Array<{ id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }>;
      };

      const alerts: RoadAlert[] = [];
      const seen = new Set<string>();
      for (const el of data.elements ?? []) {
        const elLat = el.lat ?? el.center?.lat;
        const elLon = el.lon ?? el.center?.lon;
        if (elLat == null || elLon == null) continue;
        const alert = parseAlertTags(el, seen, elLat, elLon);
        if (alert) alerts.push(alert);
      }
      return alerts.slice(0, 80);
    } catch {
      continue;
    }
  }
  return [];
}

async function fetchOverpassBatch(
  endpoint: string,
  samples: Array<{ lat: number; lon: number }>
): Promise<Array<{ id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }>> {
  const query = buildSampledOverpassQuery(samples);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 22000);

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: OVERPASS_HEADERS,
    body: `data=${encodeURIComponent(query)}`,
    signal: controller.signal,
  });
  clearTimeout(timeoutId);

  if (!res.ok) {
    throw new Error(`Overpass ${res.status}`);
  }

  const data = (await res.json()) as {
    elements?: Array<{ id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }>;
  };
  return data.elements ?? [];
}

const BR_MAXSPEED_DEFAULTS: Record<string, number> = {
  'br:urban': 40,
  'br:rural': 60,
  'br:national': 80,
  'br:trunk': 80,
  'br:motorway': 110,
  'urban': 40,
  'rural': 60,
  'living_street': 20,
};

function parseMaxspeedTag(raw: string | undefined): number | null {
  if (!raw?.trim()) return null;
  const v = raw.trim().toLowerCase().replace(/\s+/g, '');
  if (BR_MAXSPEED_DEFAULTS[v]) return BR_MAXSPEED_DEFAULTS[v];
  const mph = v.match(/^(\d+)\s*mph$/);
  if (mph) return Math.round(Number(mph[1]) * 1.609);
  const num = v.match(/^(\d{2,3})/);
  if (num) {
    const n = Number(num[1]);
    return n >= 10 && n <= 140 ? n : null;
  }
  return null;
}

function pickMaxspeedFromTags(tags: Record<string, string>): number | null {
  const highway = tags.highway ?? '';
  if (highway === 'motorway' || highway === 'motorway_link') return 80;
  if (highway === 'trunk' || highway === 'primary') return 60;
  if (highway === 'secondary' || highway === 'tertiary') return 40;
  if (highway === 'residential' || highway === 'living_street' || highway === 'service') return 30;
  return null;
}

const speedLimitCache = new Map<string, { limit: number | null; expires: number }>();
const SPEED_LIMIT_CACHE_MS = 5 * 60_000;

function speedLimitCacheKey(lat: number, lon: number): string {
  return `${lat.toFixed(3)},${lon.toFixed(3)}`;
}

export async function querySpeedLimitAt(lat: number, lon: number): Promise<number | null> {
  const cacheKey = speedLimitCacheKey(lat, lon);
  const cached = speedLimitCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.limit;
  }

  const latS = lat.toFixed(5);
  const lonS = lon.toFixed(5);
  const query = `[out:json][timeout:8];
(
  way(around:55,${latS},${lonS})["maxspeed"];
  way(around:55,${latS},${lonS})["zone:maxspeed"];
  way(around:55,${latS},${lonS})["highway"];
);
out center tags 8;`;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: OVERPASS_HEADERS,
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!res.ok) continue;

      const data = (await res.json()) as {
        elements?: Array<{
          tags?: Record<string, string>;
          center?: { lat: number; lon: number };
        }>;
      };

      let bestExplicit: { limit: number; dist: number } | null = null;
      let bestInferred: { limit: number; dist: number } | null = null;

      for (const el of data.elements ?? []) {
        const tags = el.tags ?? {};
        const center = el.center;
        const dist =
          center != null
            ? haversineKm(lat, lon, center.lat, center.lon)
            : 0.2;

        const explicit =
          parseMaxspeedTag(tags.maxspeed) ??
          parseMaxspeedTag(tags['maxspeed:forward']) ??
          parseMaxspeedTag(tags['zone:maxspeed']);

        if (explicit != null) {
          if (!bestExplicit || dist < bestExplicit.dist) {
            bestExplicit = { limit: explicit, dist };
          }
          continue;
        }

        const inferred = pickMaxspeedFromTags(tags);
        if (inferred != null && !tags.maxspeed) {
          if (!bestInferred || dist < bestInferred.dist) {
            bestInferred = { limit: inferred, dist };
          }
        }
      }

      const limit = bestExplicit?.limit ?? bestInferred?.limit ?? null;
      speedLimitCache.set(cacheKey, { limit, expires: Date.now() + SPEED_LIMIT_CACHE_MS });
      if (speedLimitCache.size > 400) {
        const first = speedLimitCache.keys().next().value;
        if (first) speedLimitCache.delete(first);
      }
      return limit;
    } catch {
      continue;
    }
  }

  speedLimitCache.set(cacheKey, { limit: null, expires: Date.now() + 60_000 });
  return null;
}

export async function searchRoadAlertsAlongRoute(
  routePoints: Array<{ lat: number; lon: number }>
): Promise<RoadAlert[]> {
  if (routePoints.length < 2) return [];

  const samples = sampleAlongRoute(routePoints, sampleCountForRoute(routePoints));

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const alerts: RoadAlert[] = [];
      const seen = new Set<string>();
      const batches: Array<Array<{ lat: number; lon: number }>> = [];

      for (let i = 0; i < samples.length; i += OVERPASS_BATCH_SIZE) {
        batches.push(samples.slice(i, i + OVERPASS_BATCH_SIZE));
      }

      for (const batch of batches) {
        try {
          const elements = await fetchOverpassBatch(endpoint, batch);
          for (const el of elements) {
            const alert = parseAlertElement(el, routePoints, seen);
            if (alert) alerts.push(alert);
          }
        } catch {
          /* tenta próximo lote */
        }
        if (alerts.length >= 200) break;
      }

      if (alerts.length > 0) {
        return alerts.slice(0, 200);
      }
    } catch {
      continue;
    }
  }

  return [];
}

export function findNearestPoi(
  lat: number,
  lon: number,
  pois: PoiItem[],
  category?: PoiCategory
): PoiItem | undefined {
  const filtered = category ? pois.filter((p) => p.category === category) : pois;
  if (filtered.length === 0) return undefined;

  return filtered.reduce((nearest, poi) => {
    const dist = haversineKm(lat, lon, poi.lat, poi.lon);
    const nearestDist = haversineKm(lat, lon, nearest.lat, nearest.lon);
    return dist < nearestDist ? poi : nearest;
  });
}

export function computeFuelAlert(
  currentLat: number,
  currentLon: number,
  remainingFuelKm: number,
  reserveKm: number,
  fuelPois: PoiItem[]
): {
  remainingKm: number;
  status: 'ok' | 'warning' | 'critical';
  message: string;
  nearestStation?: PoiItem;
  lastSafeStation?: PoiItem;
} {
  const nearest = findNearestPoi(currentLat, currentLon, fuelPois, 'fuel');
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

  let lastSafeStation: PoiItem | undefined;
  if (fuelPois.length > 0) {
    lastSafeStation = fuelPois
      .filter((p) => {
        const dist = haversineKm(currentLat, currentLon, p.lat, p.lon);
        return dist <= remainingFuelKm - reserveKm;
      })
      .sort((a, b) => {
        const distA = haversineKm(currentLat, currentLon, a.lat, a.lon);
        const distB = haversineKm(currentLat, currentLon, b.lat, b.lon);
        return distB - distA;
      })[0];
  }

  return {
    remainingKm: remainingFuelKm,
    status,
    message,
    nearestStation: nearest,
    lastSafeStation,
  };
}

export function computeScheduledStops(
  totalDurationMinutes: number,
  stopIntervalMinutes: number
): Array<{ type: 'scheduled'; message: string; minutesUntil: number }> {
  const stops: Array<{ type: 'scheduled'; message: string; minutesUntil: number }> = [];
  for (let t = stopIntervalMinutes; t < totalDurationMinutes; t += stopIntervalMinutes) {
    stops.push({
      type: 'scheduled',
      message: `Parada programada — descanso recomendado`,
      minutesUntil: t,
    });
  }
  return stops;
}
