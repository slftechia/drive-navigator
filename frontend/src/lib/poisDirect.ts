import type { PoiResult } from '../api';
import { haversineKm, routeProgressKm, sliceRouteWindow, snapPointToRoute, distanceToRouteKm } from '../utils/geo';
const OVERPASS_ENDPOINTS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
];
const RADIUS_M = 900;

type OsmElement = {
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
};

function buildFuelQuery(samples: Array<{ lat: number; lon: number }>): string {
  const clauses = samples.map((p) => {
    const lat = p.lat.toFixed(5);
    const lon = p.lon.toFixed(5);
    return `node(around:${RADIUS_M},${lat},${lon})["amenity"="fuel"];`;
  });
  return `[out:json][timeout:18];(\n  ${clauses.join('\n  ')}\n);\nout body;`;
}

function parseFuelNode(el: OsmElement, seen: Set<string>): PoiResult | null {
  if (el.lat == null || el.lon == null) return null;
  const tags = el.tags ?? {};
  const name = tags.name ?? tags.brand ?? tags.operator ?? 'Posto';
  const text = `${name} ${tags.brand ?? ''}`.toLowerCase();
  if (/locadora|rent a car|car rental|oficina|repair/i.test(text)) return null;

  const key = `fuel-${el.lat.toFixed(5)}-${el.lon.toFixed(5)}`;
  if (seen.has(key)) return null;
  seen.add(key);

  return {
    id: String(el.id),
    name: String(name),
    category: 'fuel',
    lat: el.lat,
    lon: el.lon,
    address: tags['addr:street'] ? String(tags['addr:street']) : undefined,
  };
}

/** Postos de combustível perto de um trecho da rota (janela ao redor do GPS). */
export async function fetchFuelPoisAlongRoute(
  routePoints: Array<{ lat: number; lon: number }>,
  focusLat: number,
  focusLon: number,
  behindKm = 12,
  aheadKm = 55
): Promise<PoiResult[]> {
  if (routePoints.length < 2) return [];

  const windowPts = sliceRouteWindow(routePoints, focusLat, focusLon, behindKm, aheadKm);
  if (windowPts.length < 2) return [];

  const step = Math.max(1, Math.floor(windowPts.length / 8));
  const samples: Array<{ lat: number; lon: number }> = [];
  for (let i = 0; i < windowPts.length; i += step) {
    samples.push(windowPts[i]);
  }
  const last = windowPts[windowPts.length - 1];
  if (samples[samples.length - 1] !== last) samples.push(last);

  const query = buildFuelQuery(samples);
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 16_000);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });
      window.clearTimeout(timer);
      if (!res.ok) continue;

      const data = (await res.json()) as { elements?: OsmElement[] };
      const seen = new Set<string>();
      const pois: PoiResult[] = [];
      for (const el of data.elements ?? []) {
        const poi = parseFuelNode(el, seen);
        if (poi) pois.push(poi);
      }
      return pois.slice(0, 40);
    } catch {
      continue;
    }
  }
  return [];
}

/** Postos visíveis no mapa — só à frente do GPS durante navegação. */
export function pickFuelPoisForMap(
  pois: PoiResult[] | undefined,
  mode: 'idle' | 'preview' | 'navigate',
  userPosition: { lat: number; lon: number },
  routePoints: Array<{ lat: number; lon: number }> | undefined,
  opts: { routeOverview?: boolean; maxCount?: number } = {}
): PoiResult[] {
  if (!pois?.length || mode === 'idle') return [];
  const fuel = pois.filter((p) => p.category === 'fuel');
  if (!fuel.length) return [];

  const { routeOverview = false, maxCount = 22 } = opts;

  if (mode === 'preview') {
    return fuel
      .filter((p) => {
        if (!routePoints || routePoints.length < 2) {
          return haversineKm(userPosition.lat, userPosition.lon, p.lat, p.lon) <= 8;
        }
        return distanceToRouteKm(p, routePoints) <= 0.12;
      })
      .slice(0, 10);
  }

  if (routeOverview) {
    return fuel
      .filter((p) => !routePoints || routePoints.length < 2 || distanceToRouteKm(p, routePoints) <= 0.15)
      .slice(0, Math.min(maxCount, 20));
  }

  if (!routePoints || routePoints.length < 2) {
    return fuel
      .filter((p) => haversineKm(userPosition.lat, userPosition.lon, p.lat, p.lon) <= 6)
      .slice(0, maxCount);
  }

  const userSnap = snapPointToRoute(userPosition, routePoints);
  const userKm = routeProgressKm(userSnap, routePoints);

  return fuel
    .filter((p) => {
      if (distanceToRouteKm(p, routePoints) > 0.12) return false;
      const pKm = routeProgressKm(p, routePoints);
      return pKm >= userKm - 0.5 && pKm <= userKm + 18;
    })
    .sort((a, b) => routeProgressKm(a, routePoints) - routeProgressKm(b, routePoints))
    .slice(0, Math.min(maxCount, 12));
}
