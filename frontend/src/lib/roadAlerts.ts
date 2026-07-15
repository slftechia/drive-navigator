import type { RoadAlert } from '../api';
import { distanceToRouteKm, haversineKm, routeProgressKm, snapPointToRoute } from '../utils/geo';
import { hazardMarkerHtml, lombadaMarkerHtml, radarMarkerHtml } from './mapMarkers';

export const MAP_ALERT_TYPES = ['radar', 'lombada', 'perigo'] as const;
export type MapAlertType = (typeof MAP_ALERT_TYPES)[number];

export function isMapAlertType(type: string): type is MapAlertType {
  return MAP_ALERT_TYPES.includes(type as MapAlertType);
}

/** Alertas visíveis no mapa durante navegação/prévia. */
export function filterMapAlerts(alerts: RoadAlert[] | undefined): RoadAlert[] {
  if (!alerts?.length) return [];
  return alerts.filter((a) => isMapAlertType(a.type));
}

/** Une alertas novos aos já carregados sem duplicar. */
export function mergeRoadAlerts(
  existing: RoadAlert[] | undefined,
  incoming: RoadAlert[]
): RoadAlert[] {
  const map = new Map<string, RoadAlert>();
  for (const a of existing ?? []) {
    map.set(`${a.type}-${a.id}`, a);
  }
  for (const a of incoming) {
    map.set(`${a.type}-${a.id}`, a);
  }
  return Array.from(map.values());
}

/** Cola alertas na polyline para ícones ficarem sobre a rota. */
export function snapAlertsToRoute(
  alerts: RoadAlert[],
  routePoints: Array<{ lat: number; lon: number }>,
  maxDistKm = 0.35
): RoadAlert[] {
  if (routePoints.length < 2) return alerts;
  const out: RoadAlert[] = [];
  for (const a of alerts) {
    const snap = snapPointToRoute(a, routePoints);
    if (snap.distanceKm > maxDistKm) continue;
    out.push({ ...a, lat: snap.lat, lon: snap.lon });
  }
  return out;
}

/** Mantém alertas colados à polyline da rota. */
export function filterAlertsOnRoute(
  alerts: RoadAlert[],
  routePoints: Array<{ lat: number; lon: number }>,
  maxDistKm = 0.35
): RoadAlert[] {
  if (routePoints.length < 2) return alerts;
  return alerts.filter((a) => distanceToRouteKm(a, routePoints) <= maxDistKm);
}

export interface PickMapAlertsOptions {
  zoom?: number | null;
  routeOverview?: boolean;
  mapFocus?: { lat: number; lon: number } | null;
  visibleRadiusKm?: number;
  maxCount?: number;
}

/** Alertas visíveis no mapa (navegação / prévia). */
export function pickAlertsForMap(
  alerts: RoadAlert[] | undefined,
  mode: 'idle' | 'preview' | 'navigate',
  userPosition: { lat: number; lon: number },
  routePoints: Array<{ lat: number; lon: number }> | undefined,
  opts: PickMapAlertsOptions = {}
): RoadAlert[] {
  if (!alerts?.length || mode === 'idle') return [];

  const { zoom = null, routeOverview = false, mapFocus = null, visibleRadiusKm = 18, maxCount = 180 } = opts;
  let pool = filterMapAlerts(alerts).filter(
    (a) => Number.isFinite(a.lat) && Number.isFinite(a.lon)
  );
  if (!pool.length) return [];

  const snapKm = routeOverview ? 0.18 : 0.12;
  if (routePoints && routePoints.length >= 2) {
    pool = snapAlertsToRoute(pool, routePoints, snapKm);
  }
  if (!pool.length) return [];

  const dedupeGap = dedupeGapForZoom(zoom);
  const max =
    mode === 'preview' || routeOverview
      ? Math.min(maxCount, 80)
      : Math.min(maxCount, Math.max(maxAlertsForZoom(zoom), 18));

  if (mode === 'preview' || routeOverview) {
    return dedupeAlertsNearby(pool, dedupeGap).slice(0, max);
  }

  if (mode === 'navigate' && routePoints && routePoints.length >= 2) {
    const userSnap = snapPointToRoute(userPosition, routePoints);
    const userKm = routeProgressKm(userSnap, routePoints);
    const focus = mapFocus ?? userSnap;
    const radiusKm = Math.min(Math.max(visibleRadiusKm, 2.5), 8);

    pool = pool.filter((a) => {
      const distFocus = haversineKm(focus.lat, focus.lon, a.lat, a.lon);
      if (distFocus > radiusKm) return false;
      const aKm = routeProgressKm(a, routePoints);
      return aKm >= userKm - 0.4 && aKm <= userKm + 12;
    });
  } else if (mapFocus) {
    const radiusKm = Math.min(visibleRadiusKm, routeOverview ? 40 : 10);
    pool = pool.filter((a) => haversineKm(mapFocus.lat, mapFocus.lon, a.lat, a.lon) <= radiusKm);
  }

  return dedupeAlertsNearby(pool, dedupeGap).slice(0, max);
}

export function dedupeGapForZoom(zoom: number | null): number {
  if (zoom == null || !Number.isFinite(zoom)) return 0.02;
  if (zoom >= 17) return 0.012;
  if (zoom >= 15) return 0.025;
  if (zoom >= 13) return 0.05;
  return 0.12;
}

export function maxAlertsForZoom(zoom: number | null): number {
  if (zoom == null || !Number.isFinite(zoom)) return 60;
  if (zoom >= 17) return 90;
  if (zoom >= 15) return 55;
  if (zoom >= 13) return 30;
  return 15;
}

export function alertMarkerSizePx(zoom: number | null): number {
  if (zoom == null || !Number.isFinite(zoom)) return 30;
  if (zoom >= 17) return 36;
  if (zoom >= 15) return 30;
  if (zoom >= 13) return 24;
  return 20;
}

/** Ícones estilo Waze — HtmlMarker não herda CSS do app. */
export function alertMarkerHtml(type: MapAlertType, zoom: number | null = null): string {
  if (type === 'radar') return radarMarkerHtml(zoom);
  if (type === 'lombada') return lombadaMarkerHtml(zoom);
  return hazardMarkerHtml(zoom);
}

/** Evita pilha de ícones no mesmo trecho (OSM costuma repetir nós próximos). */
export function dedupeAlertsNearby(alerts: RoadAlert[], minGapKm: number): RoadAlert[] {
  const kept: RoadAlert[] = [];
  for (const alert of alerts) {
    const tooClose = kept.some(
      (k) =>
        k.type === alert.type &&
        haversineKm(k.lat, k.lon, alert.lat, alert.lon) < minGapKm
    );
    if (!tooClose) kept.push(alert);
  }
  return kept;
}

export function alertTypeLabel(type: RoadAlert['type']): string {
  if (type === 'radar') return 'Radar';
  if (type === 'lombada') return 'Lombada';
  if (type === 'perigo') return 'Perigo';
  return 'Alerta';
}

/** Próximo alerta à frente na rota (estilo faixa Waze). */
export function findNextAlertAhead(
  alerts: RoadAlert[] | undefined,
  user: { lat: number; lon: number },
  routePoints?: Array<{ lat: number; lon: number }>,
  maxMeters = 500
): { alert: RoadAlert; distanceMeters: number } | null {
  const pool = filterMapAlerts(alerts);
  if (!pool.length) return null;

  if (routePoints && routePoints.length >= 2) {
    const userKm = routeProgressKm(user, routePoints);
    let best: RoadAlert | null = null;
    let bestAhead = Infinity;
    for (const a of pool) {
      const aKm = routeProgressKm(a, routePoints);
      const aheadKm = aKm - userKm;
      if (aheadKm < 0.02 || aheadKm > maxMeters / 1000) continue;
      if (aheadKm < bestAhead) {
        bestAhead = aheadKm;
        best = a;
      }
    }
    if (best) return { alert: best, distanceMeters: bestAhead * 1000 };
  }

  let nearest: RoadAlert | null = null;
  let nearestM = Infinity;
  for (const a of pool) {
    const m = haversineKm(user.lat, user.lon, a.lat, a.lon) * 1000;
    if (m < 25 || m > maxMeters) continue;
    if (m < nearestM) {
      nearestM = m;
      nearest = a;
    }
  }
  return nearest ? { alert: nearest, distanceMeters: nearestM } : null;
}

export function alertTypeIcon(type: RoadAlert['type']): string {
  if (type === 'radar') return '📷';
  if (type === 'lombada') return '◆';
  return '⚠️';
}
