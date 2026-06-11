import type { RoadAlert } from '../api';
import { distanceToRouteKm, haversineKm } from '../utils/geo';

export const MAP_ALERT_TYPES = ['radar', 'lombada'] as const;
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

/** Mantém alertas colados à polyline da rota. */
export function filterAlertsOnRoute(
  alerts: RoadAlert[],
  routePoints: Array<{ lat: number; lon: number }>,
  maxDistKm = 0.16
): RoadAlert[] {
  if (routePoints.length < 2) return alerts;
  return alerts.filter((a) => distanceToRouteKm(a, routePoints) <= maxDistKm);
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
  if (zoom == null || !Number.isFinite(zoom)) return 26;
  if (zoom >= 18) return 32;
  if (zoom >= 17) return 28;
  if (zoom >= 16) return 24;
  if (zoom >= 15) return 20;
  if (zoom >= 14) return 16;
  if (zoom >= 13) return 13;
  if (zoom >= 12) return 10;
  return 7;
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

/** Ícones com estilos inline — HtmlMarker do Azure Maps não herda CSS do app. */
export function alertMarkerHtml(type: MapAlertType, zoom: number | null = null): string {
  const px = alertMarkerSizePx(zoom);
  const icon = Math.max(10, Math.round(px * 0.52));
  const border = Math.max(1.5, px * 0.07);

  if (type === 'radar') {
    return `<div style="width:${px}px;height:${px}px;border-radius:50%;background:linear-gradient(180deg,#ff8c42,#e85d04);border:${border}px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;pointer-events:none" aria-label="Radar">
      <svg width="${icon}" height="${icon}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M9 8h6v2H9V8zm0 3h6v2H9v-2z" fill="white"/>
        <path d="M12 4a8 8 0 0 0-8 8h2a6 6 0 1 1 6 6v2a8 8 0 0 0 0-16zm-1 14h2v2h-2v-2z" fill="white"/>
        <circle cx="12" cy="12" r="3.5" stroke="white" stroke-width="1.5" fill="none"/>
      </svg>
    </div>`;
  }

  return `<div style="width:${px}px;height:${px}px;background:#facc15;border:${border}px solid #111;transform:rotate(45deg);box-shadow:0 2px 6px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;pointer-events:none" aria-label="Lombada">
    <svg width="${icon}" height="${icon}" viewBox="0 0 24 24" style="transform:rotate(-45deg)" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 14 H21" stroke="#111" stroke-width="2.2" stroke-linecap="round"/>
      <path d="M7 14 Q12 6 17 14" fill="#111"/>
    </svg>
  </div>`;
}

export function alertTypeLabel(type: RoadAlert['type']): string {
  if (type === 'radar') return 'Radar';
  if (type === 'lombada') return 'Lombada';
  return 'Alerta';
}

export function alertTypeIcon(type: RoadAlert['type']): string {
  if (type === 'radar') return '📷';
  if (type === 'lombada') return '◆';
  return '⚠️';
}
