export type CommunityReportType = 'radar' | 'lombada' | 'perigo';

export interface CommunityReport {
  id: string;
  type: CommunityReportType;
  lat: number;
  lon: number;
  label: string;
  createdAt: number;
  /** Quantas confirmações (inclui o report inicial). */
  confirms: number;
}

const TTL_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_STORE = 2000;
const DEDUPE_KM = 0.08; // ~80 m

const store: CommunityReport[] = [];

function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const lat1 = (aLat * Math.PI) / 180;
  const lat2 = (bLat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function pruneExpired(): void {
  const now = Date.now();
  for (let i = store.length - 1; i >= 0; i--) {
    if (now - store[i].createdAt > TTL_MS) store.splice(i, 1);
  }
  if (store.length > MAX_STORE) {
    store.sort((a, b) => b.createdAt - a.createdAt);
    store.length = MAX_STORE;
  }
}

function defaultLabel(type: CommunityReportType): string {
  if (type === 'radar') return 'Radar (comunidade)';
  if (type === 'lombada') return 'Lombada (comunidade)';
  return 'Perigo (comunidade)';
}

export function addCommunityReport(input: {
  type: CommunityReportType;
  lat: number;
  lon: number;
  label?: string;
}): CommunityReport {
  pruneExpired();

  const existing = store.find(
    (r) =>
      r.type === input.type &&
      haversineKm(r.lat, r.lon, input.lat, input.lon) < DEDUPE_KM
  );
  if (existing) {
    existing.confirms += 1;
    existing.createdAt = Date.now(); // renova TTL
    return existing;
  }

  const report: CommunityReport = {
    id: `c-${input.type}-${Date.now()}-${Math.round(input.lat * 1e5)}-${Math.round(input.lon * 1e5)}`,
    type: input.type,
    lat: input.lat,
    lon: input.lon,
    label: input.label?.trim() || defaultLabel(input.type),
    createdAt: Date.now(),
    confirms: 1,
  };
  store.unshift(report);
  pruneExpired();
  return report;
}

export function queryCommunityReportsNear(
  lat: number,
  lon: number,
  radiusKm = 25
): CommunityReport[] {
  pruneExpired();
  return store
    .filter((r) => haversineKm(lat, lon, r.lat, r.lon) <= radiusKm)
    .sort((a, b) => b.confirms - a.confirms || b.createdAt - a.createdAt)
    .slice(0, 200);
}

export function queryCommunityReportsAlongRoute(
  points: Array<{ lat: number; lon: number }>,
  corridorKm = 0.4
): CommunityReport[] {
  pruneExpired();
  if (points.length < 2) return [];

  const out: CommunityReport[] = [];
  for (const r of store) {
    let near = false;
    // amostrar a cada ~N pontos para não O(n*m) explode
    const step = Math.max(1, Math.floor(points.length / 200));
    for (let i = 0; i < points.length; i += step) {
      if (haversineKm(r.lat, r.lon, points[i].lat, points[i].lon) <= corridorKm) {
        near = true;
        break;
      }
    }
    if (near) out.push(r);
  }
  return out.sort((a, b) => b.confirms - a.confirms).slice(0, 180);
}

export function reportsStats(): { count: number } {
  pruneExpired();
  return { count: store.length };
}
