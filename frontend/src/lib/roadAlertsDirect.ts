import type { RoadAlert } from '../api';
import { haversineKm } from '../utils/geo';
import { snapAlertsToRoute } from './roadAlerts';

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
/** Raio por amostra — deve cobrir o intervalo entre samples com folga. */
const RADIUS_M = 1400;
/** Espaçamento alvo entre amostras ao longo da rota (~1 km → overlap com raio 1.4 km). */
const SAMPLE_EVERY_KM = 1.0;
const BATCH_SIZE = 3;
const MAX_SAMPLES = 80;
const PARALLEL_BATCHES = 3;
/** Lombadas OSM costumam ficar um pouco ao lado da polyline OSRM. */
const SNAP_MAX_KM = 0.14;

type OsmElement = {
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

function routeLengthKm(points: Array<{ lat: number; lon: number }>): number {
  let km = 0;
  for (let i = 1; i < points.length; i++) {
    km += haversineKm(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon);
  }
  return km;
}

/** Amostra por distância ao longo da rota (não por índice de ponto). */
function sampleAlongRouteByDistance(
  routePoints: Array<{ lat: number; lon: number }>,
  everyKm: number,
  maxSamples: number
): Array<{ lat: number; lon: number }> {
  if (routePoints.length < 2) return routePoints.slice();
  const result: Array<{ lat: number; lon: number }> = [routePoints[0]];
  let acc = 0;
  let nextAt = everyKm;
  for (let i = 1; i < routePoints.length; i++) {
    const seg = haversineKm(
      routePoints[i - 1].lat,
      routePoints[i - 1].lon,
      routePoints[i].lat,
      routePoints[i].lon
    );
    acc += seg;
    while (acc >= nextAt && result.length < maxSamples - 1) {
      result.push(routePoints[i]);
      nextAt += everyKm;
    }
  }
  const last = routePoints[routePoints.length - 1];
  const prev = result[result.length - 1];
  if (prev.lat !== last.lat || prev.lon !== last.lon) result.push(last);
  return result;
}

function buildOverpassQuery(samples: Array<{ lat: number; lon: number }>): string {
  const clauses: string[] = [];
  for (const p of samples) {
    const lat = p.lat.toFixed(5);
    const lon = p.lon.toFixed(5);
    clauses.push(`node(around:${RADIUS_M},${lat},${lon})["highway"="speed_camera"];`);
    clauses.push(`way(around:${RADIUS_M},${lat},${lon})["highway"="speed_camera"];`);
    clauses.push(`node(around:${RADIUS_M},${lat},${lon})["enforcement"="maxspeed"];`);
    clauses.push(`node(around:${RADIUS_M},${lat},${lon})["enforcement"="traffic"];`);
    clauses.push(`node(around:${RADIUS_M},${lat},${lon})["traffic_enforcement"];`);
    clauses.push(`node(around:${RADIUS_M},${lat},${lon})["traffic_calming"];`);
    clauses.push(`way(around:${RADIUS_M},${lat},${lon})["traffic_calming"];`);
    clauses.push(
      `node(around:${RADIUS_M},${lat},${lon})["man_made"="surveillance"]["surveillance:type"="speed"];`
    );
    clauses.push(
      `node(around:${RADIUS_M},${lat},${lon})["man_made"="surveillance"]["surveillance:type"="camera"];`
    );
  }
  return `[out:json][timeout:25];(\n  ${clauses.join('\n  ')}\n);\nout center tags;`;
}

function parseOsmAlert(el: OsmElement, seen: Set<string>): RoadAlert | null {
  const tags = el.tags ?? {};
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (lat == null || lon == null) return null;

  let type: RoadAlert['type'] | null = null;
  let label = '';

  const enforcement = tags.enforcement ?? '';
  const trafficEnforcement = tags.traffic_enforcement ?? '';
  const surveillanceType = tags['surveillance:type'] ?? '';

  if (
    tags.highway === 'speed_camera' ||
    enforcement === 'maxspeed' ||
    enforcement === 'traffic' ||
    /speed|camera|radar/i.test(trafficEnforcement) ||
    (tags.man_made === 'surveillance' && /speed|camera/i.test(surveillanceType))
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

async function queryOverpassBatch(samples: Array<{ lat: number; lon: number }>): Promise<OsmElement[]> {
  const query = buildOverpassQuery(samples);
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 22000);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });
      window.clearTimeout(timer);
      if (!res.ok) continue;
      const data = (await res.json()) as { elements?: OsmElement[] };
      return data.elements ?? [];
    } catch {
      continue;
    }
  }
  return [];
}

/** Busca radares/lombadas direto no Overpass (fallback quando a API demora ou falha). */
export async function fetchRoadAlertsDirect(
  routePoints: Array<{ lat: number; lon: number }>
): Promise<RoadAlert[]> {
  if (routePoints.length < 2) return [];

  const km = routeLengthKm(routePoints);
  const sampleCount = Math.min(MAX_SAMPLES, Math.max(8, Math.ceil(km / SAMPLE_EVERY_KM) + 1));
  const samples = sampleAlongRouteByDistance(routePoints, SAMPLE_EVERY_KM, sampleCount);

  const batches: Array<Array<{ lat: number; lon: number }>> = [];
  for (let i = 0; i < samples.length; i += BATCH_SIZE) {
    batches.push(samples.slice(i, i + BATCH_SIZE));
  }

  const seen = new Set<string>();
  const alerts: RoadAlert[] = [];

  for (let i = 0; i < batches.length; i += PARALLEL_BATCHES) {
    const chunk = batches.slice(i, i + PARALLEL_BATCHES);
    const results = await Promise.allSettled(chunk.map((batch) => queryOverpassBatch(batch)));
    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      for (const el of result.value) {
        const alert = parseOsmAlert(el, seen);
        if (alert) alerts.push(alert);
      }
    }
    if (alerts.length >= 280) break;
  }

  return snapAlertsToRoute(alerts.slice(0, 320), routePoints, SNAP_MAX_KM);
}
