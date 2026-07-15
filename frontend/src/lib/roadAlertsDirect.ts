import type { RoadAlert } from '../api';
import { haversineKm } from '../utils/geo';
import { snapAlertsToRoute } from './roadAlerts';
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const RADIUS_M = 450;
const BATCH_SIZE = 3;
const MAX_SAMPLES = 64;
const PARALLEL_BATCHES = 3;

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

function sampleAlongRoute(
  routePoints: Array<{ lat: number; lon: number }>,
  maxSamples: number
): Array<{ lat: number; lon: number }> {
  if (routePoints.length <= maxSamples) return routePoints;
  const result: Array<{ lat: number; lon: number }> = [];
  const step = (routePoints.length - 1) / (maxSamples - 1);
  for (let i = 0; i < maxSamples; i++) {
    result.push(routePoints[Math.min(Math.round(i * step), routePoints.length - 1)]);
  }
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
    clauses.push(`node(around:${RADIUS_M},${lat},${lon})["man_made"="surveillance"]["surveillance:type"="speed"];`);
    clauses.push(`node(around:${RADIUS_M},${lat},${lon})["man_made"="surveillance"]["surveillance:type"="camera"];`);
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
  const sampleCount = Math.min(MAX_SAMPLES, Math.max(18, Math.ceil(km / 6)));
  const samples = sampleAlongRoute(routePoints, sampleCount);

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

  return snapAlertsToRoute(alerts.slice(0, 320), routePoints, 0.12);
}
