import type { RoadAlert } from '../api';
import { distanceToRouteKm, haversineKm, routeProgressKm, snapPointToRoute } from '../utils/geo';
import {
  ALL_ALERT_TYPES,
  ALERT_TYPE_META,
  alertTypeIcon as metaIcon,
  alertTypeLabel as metaLabel,
  isMapAlertType,
  type MapAlertType,
  type RoadAlertType,
} from './alertTypes';
import {
  communityAlertMarkerHtml,
  hazardMarkerHtml,
  lombadaMarkerHtml,
  radarMarkerHtml,
} from './mapMarkers';

export { ALL_ALERT_TYPES, isMapAlertType };
export type { MapAlertType, RoadAlertType };
export const MAP_ALERT_TYPES = ALL_ALERT_TYPES;

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

/** Progresso do alerta na rota (projeta só para cálculo; não muda o ícone no mapa). */
export function alertRouteProgressKm(
  alert: { lat: number; lon: number },
  routePoints: Array<{ lat: number; lon: number }>
): number {
  const snap = snapPointToRoute(alert, routePoints, true);
  return routeProgressKm(snap, routePoints);
}

/**
 * Filtra alertas que estão perto da rota.
 * Mantém sempre as coordenadas OSM — nunca cola na esquina/seta de curva.
 */
export function snapAlertsToRoute(
  alerts: RoadAlert[],
  routePoints: Array<{ lat: number; lon: number }>,
  maxDistKm = 0.35
): RoadAlert[] {
  if (routePoints.length < 2) return alerts;
  return alerts.filter((a) => {
    const snap = snapPointToRoute(a, routePoints, true);
    return snap.distanceKm <= maxDistKm;
  });
}

/** Mantém alertas próximos da polyline da rota. */
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
  /** Usuário pinçou/arrastou: mostrar alertas na área da câmera (não só à frente do GPS). */
  exploring?: boolean;
  /** Origem/destino para não empilhar ícones na prévia. */
  routeEnds?: {
    origin?: { lat: number; lon: number } | null;
    destination?: { lat: number; lon: number } | null;
  };
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

  const {
    zoom = null,
    routeOverview = false,
    mapFocus = null,
    visibleRadiusKm = 18,
    maxCount = 180,
    exploring = false,
    routeEnds,
  } = opts;

  let pool = filterMapAlerts(alerts).filter(
    (a) => Number.isFinite(a.lat) && Number.isFinite(a.lon)
  );
  if (!pool.length) return [];

  // Lombadas OSM costumam ficar um pouco ao lado da polyline — folga generosa.
  const snapKm = routeOverview ? 0.45 : 0.5;
  if (routePoints && routePoints.length >= 2) {
    pool = snapAlertsToRoute(pool, routePoints, snapKm);
  }
  if (!pool.length) return [];

  // Prévia: evita lombada/carro/bandeira um em cima do outro nas pontas.
  if ((mode === 'preview' || routeOverview) && routeEnds) {
    const tipGapKm = 0.09;
    pool = pool.filter((a) => {
      if (routeEnds.origin && haversineKm(a.lat, a.lon, routeEnds.origin.lat, routeEnds.origin.lon) < tipGapKm) {
        return false;
      }
      if (
        routeEnds.destination &&
        haversineKm(a.lat, a.lon, routeEnds.destination.lat, routeEnds.destination.lon) < tipGapKm
      ) {
        return false;
      }
      return true;
    });
  }

  const max =
    mode === 'preview' || routeOverview
      ? Math.min(maxCount, 100)
      : Math.min(maxCount, Math.max(maxAlertsForZoom(zoom), 40));

  if (mode === 'preview' || routeOverview) {
    return dedupeAlertsNearby(pool, zoom).slice(0, max);
  }

  if (mode === 'navigate' && routePoints && routePoints.length >= 2) {
    const focus = mapFocus ?? userPosition;
    const radiusKm = exploring
      ? Math.min(Math.max(visibleRadiusKm, 5), 18)
      : Math.min(Math.max(visibleRadiusKm, 3), 10);

    pool = pool.filter((a) => haversineKm(focus.lat, focus.lon, a.lat, a.lon) <= radiusKm);

    // Em follow: prioriza à frente do carro. Ao pinçar: tudo o que estiver na área da câmera.
    if (!exploring) {
      const userSnap = snapPointToRoute(userPosition, routePoints, true);
      const userKm = routeProgressKm(userSnap, routePoints);
      pool = pool.filter((a) => {
        const aKm = alertRouteProgressKm(a, routePoints);
        return aKm >= userKm - 0.5 && aKm <= userKm + 15;
      });
    }
  } else if (mapFocus) {
    const radiusKm = Math.min(visibleRadiusKm, routeOverview ? 40 : 12);
    pool = pool.filter((a) => haversineKm(mapFocus.lat, mapFocus.lon, a.lat, a.lon) <= radiusKm);
  }

  return dedupeAlertsNearby(pool, zoom).slice(0, max);
}

/** Gap mínimo para dedupe — lombadas bem perto (18 m) ainda aparecem separadas. */
export function dedupeGapForType(type: RoadAlert['type'], zoom: number | null): number {
  if (type === 'lombada') {
    if (zoom != null && zoom >= 16) return 0.012; // 12 m
    return 0.018; // 18 m
  }
  if (type === 'radar') return 0.035;
  if (zoom == null || !Number.isFinite(zoom)) return 0.04;
  if (zoom >= 17) return 0.02;
  if (zoom >= 15) return 0.035;
  if (zoom >= 13) return 0.06;
  return 0.1;
}

export function dedupeGapForZoom(zoom: number | null): number {
  return dedupeGapForType('perigo', zoom);
}

export function maxAlertsForZoom(zoom: number | null): number {
  if (zoom == null || !Number.isFinite(zoom)) return 80;
  if (zoom >= 17) return 120;
  if (zoom >= 15) return 80;
  if (zoom >= 13) return 50;
  return 28;
}

export function alertMarkerSizePx(zoom: number | null): number {
  if (zoom == null || !Number.isFinite(zoom)) return 30;
  if (zoom >= 17) return 36;
  if (zoom >= 15) return 30;
  if (zoom >= 13) return 24;
  return 20;
}

export function visibleRadiusKmForZoom(zoom: number | null): number {
  if (zoom == null || !Number.isFinite(zoom)) return 6;
  if (zoom >= 16) return 3.5;
  if (zoom >= 14) return 5;
  if (zoom >= 12) return 8;
  return 14;
}

export function alertTypeLabel(type: RoadAlert['type']): string {
  return metaLabel(type);
}

export function alertTypeIcon(type: RoadAlert['type']): string {
  return metaIcon(type);
}

/**
 * Remove só duplicatas OSM quase idênticas.
 * Lombadas em sequência (2–4 a ~20–40 m) permanecem.
 */
export function dedupeAlertsNearby(
  alerts: RoadAlert[],
  zoom: number | null = null
): RoadAlert[] {
  const kept: RoadAlert[] = [];
  const sorted = [...alerts].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  for (const alert of sorted) {
    const gap = dedupeGapForType(alert.type, zoom);
    const tooClose = kept.some((k) => {
      if (k.type !== alert.type) return false;
      if (k.id === alert.id) return true;
      return haversineKm(k.lat, k.lon, alert.lat, alert.lon) < gap;
    });
    if (!tooClose) kept.push(alert);
  }
  return kept;
}

export type NextAlertAhead = {
  alert: RoadAlert;
  distanceMeters: number;
  /** Quantos do mesmo tipo em sequência (~120 m à frente do primeiro). */
  count: number;
};

/** Próximo alerta à frente na rota (estilo faixa Waze). */
export function findNextAlertAhead(
  alerts: RoadAlert[] | undefined,
  user: { lat: number; lon: number },
  routePoints?: Array<{ lat: number; lon: number }>,
  maxMeters = 500
): NextAlertAhead | null {
  const pool = filterMapAlerts(alerts);
  if (!pool.length) return null;

  if (routePoints && routePoints.length >= 2) {
    const userKm = routeProgressKm(snapPointToRoute(user, routePoints, true), routePoints);
    let best: RoadAlert | null = null;
    let bestAhead = Infinity;
    let bestKm = 0;

    for (const a of pool) {
      const aKm = alertRouteProgressKm(a, routePoints);
      const aheadKm = aKm - userKm;
      if (aheadKm < 0.015 || aheadKm > maxMeters / 1000) continue;
      if (aheadKm < bestAhead) {
        bestAhead = aheadKm;
        best = a;
        bestKm = aKm;
      }
    }
    if (!best) return null;

    const cluster = pool.filter((a) => {
      if (a.type !== best!.type) return false;
      const aKm = alertRouteProgressKm(a, routePoints);
      return aKm >= bestKm - 0.01 && aKm <= bestKm + 0.14;
    });

    return {
      alert: best,
      distanceMeters: bestAhead * 1000,
      count: Math.max(1, cluster.length),
    };
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
  return nearest ? { alert: nearest, distanceMeters: nearestM, count: 1 } : null;
}

export function alertMarkerHtml(type: RoadAlert['type'], zoom: number | null = null): string {
  if (type === 'radar') return radarMarkerHtml(zoom);
  if (type === 'lombada') return lombadaMarkerHtml(zoom);
  if (type === 'perigo') return hazardMarkerHtml(zoom);
  const meta = ALERT_TYPE_META[type as MapAlertType];
  const colors: Partial<Record<MapAlertType, string>> = {
    policia: 'linear-gradient(180deg,#3b82f6,#1d4ed8)',
    acidente: 'linear-gradient(180deg,#ef4444,#b91c1c)',
    congestionamento: 'linear-gradient(180deg,#f59e0b,#d97706)',
    obra: 'linear-gradient(180deg,#f97316,#c2410c)',
    via_fechada: 'linear-gradient(180deg,#64748b,#334155)',
    carro_parado: 'linear-gradient(180deg,#8b5cf6,#6d28d9)',
    animal: 'linear-gradient(180deg,#84cc16,#4d7c0f)',
    clima: 'linear-gradient(180deg,#38bdf8,#0284c7)',
  };
  return communityAlertMarkerHtml(
    meta?.icon ?? '⚠️',
    colors[type as MapAlertType] ?? 'linear-gradient(180deg,#fb923c,#ea580c)',
    zoom,
    meta?.label ?? 'Alerta'
  );
}
