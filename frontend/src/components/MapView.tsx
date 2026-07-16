import { useEffect, useRef, useCallback, useState } from 'react';
import type { RouteInstruction, RoutePoint, RoadAlert, PoiResult } from '../api';
import { loadAzureMaps, type AtlasNamespace } from '../lib/mapEngine';
import { mapStyleForTheme, routeColorsForTheme, type AppTheme } from '../lib/theme';
import type { DataSourceInstance, HtmlMarkerInstance, MapInstance, MapPosition } from '../lib/atlasTypes';
import {
  alertMarkerHtml,
  isMapAlertType,
  offsetAlertFromManeuver,
  pickAlertsForMap,
} from '../lib/roadAlerts';
import { pickFuelPoisForMap } from '../lib/poisDirect';
import { fuelMarkerHtml, destinationMarkerHtml } from '../lib/mapMarkers';
import { turnMapMarkerHtml } from '../lib/turnIcons';
import { vehicleMarkerHtml } from '../lib/vehicleMarker';
import {
  navCameraCenter,
  navCameraPadding,
  navPitchForViewport,
  navTargetZoom,
  ZOOM_NAV_FLAT,
  ZOOM_NAV_MIN_ACTIVE,
  ZOOM_NAV_MAX,
  NAV_ZOOM_MANUAL_DELTA,
  NAV_MAP_MIN_ZOOM,
  NAV_MAP_MAX_ZOOM,
  isMobileViewport,
} from '../lib/navCamera';
import {
  bearingDeg,
  distanceToRouteKm,
  haversineKm,
  smoothBearingDeg,
  snapPointToRoute,
  routeHeadingAtPoint,
} from '../utils/geo';

export type MapMode = 'idle' | 'preview' | 'navigate';

interface MapViewProps {
  userPosition: { lat: number; lon: number };
  userHeading?: number | null;
  userSpeedMps?: number | null;
  routePoints?: RoutePoint[];
  routeOrigin?: { lat: number; lon: number };
  destination?: { lat: number; lon: number };
  roadAlerts?: RoadAlert[];
  fuelPois?: PoiResult[];
  nextManeuver?: RouteInstruction | null;
  mode?: MapMode;
  layoutKey?: string;
  navigationStartToken?: number;
  onFollowChange?: (following: boolean) => void;
  followingGps?: boolean;
  routeOverviewActive?: boolean;
  routeOverviewToken?: number;
  previewFitToken?: number;
  recenterToken?: number;
  routeAlternatives?: Array<{ id: string; points: RoutePoint[] }>;
  selectedRouteId?: string;
  mapTheme?: AppTheme;
  onFuelPoiClick?: (poi: PoiResult) => void;
}

const ZOOM_HOME = 15;
const ZOOM_ROUTE_OVERVIEW_MAX = 13;
const NAV_CAMERA_EASE_MS = 420;
const ZOOM_PREVIEW_MAX = 12;
const ZOOM_MIN_NAV = 10;
/** Rotas longas (100+ km) precisam zoom ~6–8; Waze permite afastar bem mais. */
const ZOOM_MIN_OVERVIEW = 4;
/** Abaixo deste zoom mostra a rota inteira em vez do corredor local. */
const ZOOM_FULL_ROUTE = 13.5;
const ROUTE_CORRIDOR_NAV_KM = 10;
const ROUTE_POINTS_NAV_CORRIDOR = 3000;
const ROUTE_POINTS_PREVIEW_MAX = 4000;
const ROUTE_SIMPLIFY_MIN_KM = 0.018;
/** Ver rota / overview: vértices mais densos para a linha seguir as ruas. */
const ROUTE_SIMPLIFY_OVERVIEW_KM = 0.004;
const ROUTE_POINTS_OVERVIEW_LINE = 8000;
const ALERTS_MAX_PREVIEW = 180;
const FOLLOW_MIN_INTERVAL_MS = 350;
const FOLLOW_MIN_MOVE_KM = 0.003;
const HEADING_CAMERA_MIN_DEG = 2.5;
const ROUTE_LOOKAHEAD_KM = 0.09;
const GPS_HEADING_MIN_SPEED_MPS = 0.8;
/** GPS a mais de X km da rota: câmera e marcador usam o início da rota (evita mapa na África). */
/** Distância máxima da polyline para considerar GPS “na rota”. */
const GPS_ON_ROUTE_MAX_KM = 0.22;
const NAV_SNAP_TO_START_MS = 12000;
const NAV_CAMERA_GUARD_MS = 8000;

/** Mantém formato da via: distância mínima entre pontos, não pula vértices de canto. */
function simplifyRoutePoints(
  points: RoutePoint[],
  maxPoints: number,
  minGapKm = ROUTE_SIMPLIFY_MIN_KM
): RoutePoint[] {
  if (points.length < 2) return [];
  const thinned: RoutePoint[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const last = thinned[thinned.length - 1];
    if (haversineKm(last.lat, last.lon, points[i].lat, points[i].lon) >= minGapKm) {
      thinned.push(points[i]);
    }
  }
  const end = points[points.length - 1];
  const tail = thinned[thinned.length - 1];
  if (tail.lat !== end.lat || tail.lon !== end.lon) thinned.push(end);
  if (thinned.length <= maxPoints) return thinned;

  const result: RoutePoint[] = [];
  const step = (thinned.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.min(Math.round(i * step), thinned.length - 1);
    result.push(thinned[idx]);
  }
  return result;
}

function routeCorridorSegment(
  points: RoutePoint[],
  focus: { lat: number; lon: number },
  corridorKm: number
): RoutePoint[] {
  const closest = findClosestOnRoute(points, focus.lat, focus.lon);
  const closestIdx = closest?.index ?? 0;
  const segment: RoutePoint[] = [];
  for (let i = closestIdx; i >= 0; i--) {
    segment.unshift(points[i]);
    if (
      i < closestIdx &&
      haversineKm(points[i].lat, points[i].lon, points[closestIdx].lat, points[closestIdx].lon) > corridorKm
    ) {
      break;
    }
  }
  for (let i = closestIdx + 1; i < points.length; i++) {
    segment.push(points[i]);
    if (haversineKm(points[i].lat, points[i].lon, points[closestIdx].lat, points[closestIdx].lon) > corridorKm) {
      break;
    }
  }
  return segment.length >= 2 ? segment : points.slice(0, Math.min(800, points.length));
}

/** Quanto mais afastado o zoom, mais trecho da rota é desenhado (estilo Waze). */
function corridorKmForZoom(zoom: number): number {
  if (zoom <= 8) return 1_000_000;
  if (zoom <= 10) return 280;
  if (zoom <= 11.5) return 120;
  if (zoom <= ZOOM_FULL_ROUTE) return 45;
  return ROUTE_CORRIDOR_NAV_KM;
}

function routeTotalLengthKm(points: RoutePoint[]): number {
  if (points.length < 2) return 0;
  let km = 0;
  for (let i = 1; i < points.length; i++) {
    km += haversineKm(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon);
  }
  return km;
}

/** Navegação: trecho perto do carro. Prévia / ver rota / zoom afastado: rota inteira. */
function routePointsForDisplay(
  points: RoutePoint[],
  mode: MapMode,
  focus: { lat: number; lon: number },
  opts: { fullRouteView?: boolean; zoom?: number | null } = {}
): RoutePoint[] {
  if (points.length < 2) return [];
  const { fullRouteView = false, zoom = null } = opts;

  if (mode === 'navigate' && !fullRouteView) {
    const corridorKm =
      zoom != null && Number.isFinite(zoom)
        ? corridorKmForZoom(zoom)
        : ROUTE_CORRIDOR_NAV_KM;
    if (corridorKm >= routeTotalLengthKm(points) * 0.95) {
      return simplifyRoutePoints(points, ROUTE_POINTS_OVERVIEW_LINE, ROUTE_SIMPLIFY_OVERVIEW_KM);
    }
    const corridor = routeCorridorSegment(points, focus, corridorKm);
    const minGap =
      zoom != null && zoom >= 16 ? 0.006 : zoom != null && zoom >= 14 ? 0.009 : 0.012;
    return simplifyRoutePoints(corridor, ROUTE_POINTS_NAV_CORRIDOR, minGap);
  }
  const overviewGap =
    zoom != null && zoom >= 15
      ? 0.0025
      : zoom != null && zoom >= 12
        ? 0.0035
        : ROUTE_SIMPLIFY_OVERVIEW_KM;
  return simplifyRoutePoints(points, ROUTE_POINTS_OVERVIEW_LINE, overviewGap);
}

function isManualMapExplore(mode: MapMode, routeOverview: boolean, following: boolean): boolean {
  return mode === 'navigate' && !following && !routeOverview;
}

/** Rota inteira só em overview ou zoom bem afastado; pan/zoom local usa corredor no centro do mapa. */
function shouldDrawFullRoute(
  mode: MapMode,
  routeOverview: boolean,
  following: boolean,
  zoom: number | null
): boolean {
  if (mode !== 'navigate') return true;
  if (routeOverview) return true;
  if (!following && zoom != null && Number.isFinite(zoom) && zoom <= ZOOM_FULL_ROUTE) return true;
  return false;
}

function mapCameraCenter(map: MapInstance | null): { lat: number; lon: number } | null {
  if (!map) return null;
  const center = map.getCamera()?.center;
  if (!center || center.length < 2) return null;
  const lon = Number(center[0]);
  const lat = Number(center[1]);
  if (!isValidCoord(lat, lon)) return null;
  return { lat, lon };
}

function visibleRadiusKmForZoom(zoom: number | null): number {
  if (zoom == null || !Number.isFinite(zoom)) return 6;
  if (zoom >= 17) return 2.2;
  if (zoom >= 16) return 3.5;
  if (zoom >= 15) return 5;
  if (zoom >= 14) return 7;
  if (zoom >= 12) return 10;
  return 12;
}

const NORTH_UP_CAMERA = { bearing: 0, pitch: 0 } as const;

const MAP_INTERACTION = {
  dragRotateInteraction: false,
  touchRotate: false,
  scrollZoomInteraction: true,
  touchZoomRotateInteraction: true,
  dblClickZoomInteraction: true,
} as const;

function waitForElementSize(el: HTMLElement, minPx = 50, timeoutMs = 6000): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();
    const tick = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width >= minPx && height >= minPx) {
        resolve();
        return;
      }
      if (performance.now() - start >= timeoutMs) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
}

function debounce(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}

const CAMERA_JUMP = { duration: 0, type: 'jump' as const };
const CAMERA_EASE = { duration: NAV_CAMERA_EASE_MS, type: 'ease' as const };

function isValidCoord(lat: number, lon: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return false;
  // GPS inválido (0,0) centraliza no Atlântico — mapa em "outro idioma" sem rota
  if (Math.abs(lat) < 0.0001 && Math.abs(lon) < 0.0001) return false;
  return true;
}

function findClosestOnRoute(
  points: RoutePoint[],
  lat: number,
  lon: number
): { point: RoutePoint; index: number; distanceKm: number } | null {
  if (points.length === 0) return null;
  let index = 0;
  let minD = Infinity;
  for (let i = 0; i < points.length; i++) {
    const d = haversineKm(lat, lon, points[i].lat, points[i].lon);
    if (d < minD) {
      minD = d;
      index = i;
    }
  }
  return { point: points[index], index, distanceKm: minD };
}

function routeAnchor(
  routePoints: RoutePoint[],
  routeOrigin?: { lat: number; lon: number }
): { lat: number; lon: number } | null {
  if (routeOrigin && isValidCoord(routeOrigin.lat, routeOrigin.lon)) {
    return { lat: routeOrigin.lat, lon: routeOrigin.lon };
  }
  if (routePoints.length > 0 && isValidCoord(routePoints[0].lat, routePoints[0].lon)) {
    return { lat: routePoints[0].lat, lon: routePoints[0].lon };
  }
  return null;
}

function isGpsOnRoute(
  user: { lat: number; lon: number },
  routePoints: RoutePoint[]
): boolean {
  if (!isValidCoord(user.lat, user.lon) || routePoints.length < 2) return false;
  return distanceToRouteKm(user, routePoints) <= GPS_ON_ROUTE_MAX_KM;
}

/** Onde centralizar mapa/rota: só usa GPS se estiver sobre a rota; senão âncora da rota. */
function headingFromRoute(
  points: RoutePoint[],
  focus: { lat: number; lon: number },
  _lookAheadKm = ROUTE_LOOKAHEAD_KM
): number | null {
  return routeHeadingAtPoint(focus, points, _lookAheadKm);
}

function headingDeltaDeg(a: number, b: number): number {
  let d = Math.abs(a - b) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

function resolveNavHeading(
  focus: { lat: number; lon: number },
  userHeading: number | null | undefined,
  userSpeedMps: number | null | undefined,
  routePoints: RoutePoint[] | undefined,
  prevPos: { lat: number; lon: number } | null,
  fallbackBearing: number | null
): number {
  const routeHeading =
    routePoints && routePoints.length >= 2 ? headingFromRoute(routePoints, focus) : null;

  // Preferir rumo da rota se o compass GPS divergir muito (comum em baixa velocidade / urbano).
  if (
    userHeading != null &&
    !Number.isNaN(userHeading) &&
    (userSpeedMps ?? 0) >= GPS_HEADING_MIN_SPEED_MPS
  ) {
    if (routeHeading != null && headingDeltaDeg(userHeading, routeHeading) > 40) {
      return routeHeading;
    }
    return userHeading;
  }
  if (routeHeading != null) return routeHeading;
  if (userHeading != null && !Number.isNaN(userHeading)) return userHeading;
  if (prevPos) {
    const moved = haversineKm(prevPos.lat, prevPos.lon, focus.lat, focus.lon);
    if (moved > 0.006) return bearingDeg(prevPos.lat, prevPos.lon, focus.lat, focus.lon);
  }
  return fallbackBearing ?? routeHeading ?? 0;
}

function resolveRouteFocus(
  user: { lat: number; lon: number },
  routePoints: RoutePoint[],
  routeOrigin?: { lat: number; lon: number },
  forceRouteStart = false
): { lat: number; lon: number } {
  const anchor = routeAnchor(routePoints, routeOrigin);
  if (!anchor) return user;
  if (forceRouteStart) return anchor;
  if (!isValidCoord(user.lat, user.lon)) return anchor;
  const snap = snapPointToRoute(user, routePoints);
  if (snap.distanceKm <= GPS_ON_ROUTE_MAX_KM) {
    return { lat: snap.lat, lon: snap.lon };
  }
  return anchor;
}

export default function MapView({
  userPosition,
  routePoints,
  routeOrigin,
  destination,
  roadAlerts,
  fuelPois,
  nextManeuver = null,
  userHeading = null,
  userSpeedMps = null,
  mode = 'idle',
  layoutKey = '',
  navigationStartToken = 0,
  onFollowChange,
  followingGps = true,
  routeOverviewActive = false,
  routeOverviewToken = 0,
  previewFitToken = 0,
  recenterToken = 0,
  routeAlternatives,
  selectedRouteId,
  mapTheme = 'day',
  onFuelPoiClick,
}: MapViewProps) {
  const themeRef = useRef(mapTheme);
  themeRef.current = mapTheme;
  const mapRef = useRef<HTMLDivElement>(null);
  const atlasRef = useRef<AtlasNamespace | null>(null);
  const mapInstance = useRef<MapInstance | null>(null);
  const routeDsRef = useRef<DataSourceInstance | null>(null);
  const altRouteDsRef = useRef<DataSourceInstance | null>(null);
  const alertMarkersRef = useRef<HtmlMarkerInstance[]>([]);
  const fuelMarkersRef = useRef<HtmlMarkerInstance[]>([]);
  const turnMarkerRef = useRef<HtmlMarkerInstance | null>(null);
  const destDsRef = useRef<DataSourceInstance | null>(null);
  const destMarkerRef = useRef<HtmlMarkerInstance | null>(null);
  const vehicleMarkerRef = useRef<HtmlMarkerInstance | null>(null);
  const lastVehicleHeadingRef = useRef<number | null>(null);
  const lastVehiclePosRef = useRef<{ lat: number; lon: number } | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [mapZoom, setMapZoom] = useState<number | null>(null);
  const [mapViewToken, setMapViewToken] = useState(0);
  const mapReadyRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const routeKeyRef = useRef('');
  const followRef = useRef(true);
  const modeRef = useRef(mode);
  const lastIdleCenterRef = useRef<{ lat: number; lon: number } | null>(null);
  const lastCameraRef = useRef<{ lat: number; lon: number } | null>(null);
  const onFollowChangeRef = useRef(onFollowChange);
  const mapCleanupRef = useRef<(() => void) | null>(null);
  const mapInitRef = useRef(false);
  const hasIdleCenteredRef = useRef(false);
  const lastContainerSizeRef = useRef({ w: 0, h: 0 });
  const lastFollowMsRef = useRef(0);
  const navSnapToStartUntilRef = useRef(0);
  const navFollowPauseUntilRef = useRef(0);
  const navStartHandledTokenRef = useRef(0);
  const navAnchorRef = useRef<{ lat: number; lon: number } | null>(null);
  const navCameraGuardUntilRef = useRef(0);
  const routePointsRef = useRef(routePoints);
  const routeOriginRef = useRef(routeOrigin);
  const userPositionRef = useRef(userPosition);
  routePointsRef.current = routePoints;
  routeOriginRef.current = routeOrigin;
  userPositionRef.current = userPosition;

  const routeRedrawRef = useRef<(() => void) | null>(null);
  const interactionEndRedrawRef = useRef<(() => void) | null>(null);
  if (!interactionEndRedrawRef.current) {
    interactionEndRedrawRef.current = debounce(() => {
      if (modeRef.current !== 'navigate' || followRef.current || routeOverviewRef.current) return;
      routeRedrawRef.current?.(true);
    }, 450);
  }
  const forceNavCameraRef = useRef<(forceRouteStart: boolean, resetZoom?: boolean, force?: boolean) => void>(() => {});
  const lastRouteDrawMsRef = useRef(0);
  const lastNavBearingRef = useRef<number | null>(null);
  const navPitchEnabledRef = useRef(true);
  const lastAppliedHeadingRef = useRef<number | null>(null);
  const userSpeedRef = useRef(userSpeedMps);
  const programmaticCameraRef = useRef(false);
  const manualExploreLockRef = useRef(false);
  const routeOverviewRef = useRef(routeOverviewActive);
  routeOverviewRef.current = routeOverviewActive;
  userSpeedRef.current = userSpeedMps;
  onFollowChangeRef.current = onFollowChange;
  modeRef.current = mode;

  const programmaticTokenRef = useRef(0);
  const markProgrammaticCamera = useCallback((holdMs = NAV_CAMERA_EASE_MS + 700) => {
    programmaticCameraRef.current = true;
    const token = ++programmaticTokenRef.current;
    window.setTimeout(() => {
      if (token === programmaticTokenRef.current) {
        programmaticCameraRef.current = false;
      }
    }, holdMs);
  }, []);

  const isManualMapControl = useCallback(() => {
    return manualExploreLockRef.current || Date.now() < navFollowPauseUntilRef.current;
  }, []);

  const pauseGpsFollow = useCallback((fromZoom = false) => {
    if (programmaticCameraRef.current) return;
    if (Date.now() < navCameraGuardUntilRef.current) return;
    if (modeRef.current !== 'navigate') return;
    // Mantém o mapa explorável até o usuário tocar em Recentralizar.
    navFollowPauseUntilRef.current = Date.now() + (fromZoom ? 60_000 : 60_000);
    manualExploreLockRef.current = true;
    try {
      mapInstance.current?.setMaxZoom?.(NAV_MAP_MAX_ZOOM);
    } catch {
      /* ignore */
    }
    if (followRef.current) {
      followRef.current = false;
      onFollowChangeRef.current?.(false);
    }
  }, []);

  const resizeMapImmediate = useCallback(() => {
    const map = mapInstance.current;
    const el = mapRef.current;
    if (!map || !mapReadyRef.current || !el) return;

    const { width, height } = el.getBoundingClientRect();
    const last = lastContainerSizeRef.current;
    if (Math.abs(last.w - width) < 2 && Math.abs(last.h - height) < 2) return;
    lastContainerSizeRef.current = { w: width, h: height };

    try {
      map.resize();
    } catch {
      /* ignore resize on disposed map */
    }
  }, []);

  const resizeMapRef = useRef(resizeMapImmediate);
  resizeMapRef.current = resizeMapImmediate;
  const resizeMap = useRef(debounce(() => resizeMapRef.current(), 400)).current;

  const centerOnUser = useCallback(
    (zoom: number, padding?: { top?: number; bottom?: number; left?: number; right?: number }) => {
      const map = mapInstance.current;
      if (!mapReadyRef.current || !map || !isValidCoord(userPosition.lat, userPosition.lon)) return;
      map.setCamera(
        {
          center: [userPosition.lon, userPosition.lat],
          zoom,
          minZoom: ZOOM_MIN_NAV,
          padding,
          ...NORTH_UP_CAMERA,
        },
        CAMERA_JUMP
      );
    },
    [userPosition.lat, userPosition.lon]
  );

  const syncNavAnchor = useCallback(() => {
    const pts = routePointsRef.current;
    const anchor = routeAnchor(pts ?? [], routeOriginRef.current);
    if (anchor) navAnchorRef.current = anchor;
    return anchor;
  }, []);

  const resolveNavFocusNow = useCallback((forceRouteStart: boolean) => {
    const pts = routePointsRef.current;
    const user = userPositionRef.current;
    const origin = routeOriginRef.current;
    const anchor = navAnchorRef.current ?? syncNavAnchor();

    if (pts && pts.length >= 2) {
      return resolveRouteFocus(user, pts, origin, forceRouteStart);
    }
    if (anchor) return anchor;
    return user;
  }, [syncNavAnchor]);

  const setCameraToFocus = useCallback(
    (
      focus: { lat: number; lon: number },
      opts?: { heading?: number | null; animate?: boolean; resetZoom?: boolean; force?: boolean }
    ) => {
      const map = mapInstance.current;
      const el = mapRef.current;
      if (!mapReadyRef.current || !map || !el || !isValidCoord(focus.lat, focus.lon)) return;
      if (!opts?.force && isManualMapControl() && modeRef.current === 'navigate') return;

      const { width, height } = el.getBoundingClientRect();
      if (width < 80 || height < 80) return;

      const lon = Number(focus.lon);
      const lat = Number(focus.lat);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;

      const animate = opts?.animate ?? false;
      const transition = animate ? CAMERA_EASE : CAMERA_JUMP;

      if (modeRef.current === 'navigate') {
        if (!followRef.current && !routeOverviewRef.current && !opts?.force) return;

        const rawHeading = resolveNavHeading(
          focus,
          opts?.heading ?? userHeading,
          userSpeedRef.current,
          routePointsRef.current,
          lastVehiclePosRef.current,
          lastNavBearingRef.current
        );
    let bearing = smoothBearingDeg(lastNavBearingRef.current, rawHeading, 0.65);
        if (!Number.isFinite(bearing)) bearing = 0;
        lastNavBearingRef.current = bearing;
        lastAppliedHeadingRef.current = rawHeading;

        const pitch = navPitchForViewport();
        const cam = navCameraCenter(lat, lon, bearing, pitch);
        const targetZoom = navTargetZoom(pitch);
        const padding = navCameraPadding();

        markProgrammaticCamera();
        map.applyNavigationCamera(
          [cam.lon, cam.lat],
          targetZoom,
          bearing,
          pitch,
          padding,
          animate
        );
      } else {
        try {
          map.setCamera(
            { center: [lon, lat], zoom: ZOOM_NAV_FLAT, bearing: 0, pitch: 0 },
            CAMERA_JUMP
          );
        } catch {
          return;
        }
      }
      lastCameraRef.current = { lat, lon };
    },
    [userHeading, markProgrammaticCamera]
  );

  const forceNavCamera = useCallback(
    (forceRouteStart: boolean, resetZoom = forceRouteStart, force = false) => {
      if (!force && isManualMapControl()) return;
      if (modeRef.current === 'navigate' && !followRef.current && !routeOverviewRef.current && !force) {
        return;
      }
      // Câmera sempre no GPS atual (snap na rota), não no início da rota.
      const focus = resolveNavFocusNow(false);
      if (!isValidCoord(focus.lat, focus.lon)) return;
      lastFollowMsRef.current = Date.now();
      setCameraToFocus(focus, {
        heading: userHeading,
        animate: !forceRouteStart && !force,
        resetZoom: resetZoom || force,
        force,
      });
    },
    [resolveNavFocusNow, setCameraToFocus, userHeading, isManualMapControl]
  );

  const applyNavCamera = useCallback(
    (force = false) => {
      const map = mapInstance.current;
      if (!mapReadyRef.current || !map) return;
      if (routeOverviewRef.current) return;
      if (!force && isManualMapControl()) return;
      if (!force && !followRef.current) return;

      if (!force) {
        const now = Date.now();
        const focusNow = resolveNavFocusNow(false);
        const rawHeading = resolveNavHeading(
          focusNow,
          userHeading,
          userSpeedRef.current,
          routePointsRef.current,
          lastVehiclePosRef.current,
          lastNavBearingRef.current
        );
        const headingChanged =
          lastAppliedHeadingRef.current == null ||
          headingDeltaDeg(lastAppliedHeadingRef.current, rawHeading) >= HEADING_CAMERA_MIN_DEG;

        if (now - lastFollowMsRef.current < FOLLOW_MIN_INTERVAL_MS && !headingChanged) return;
        const last = lastCameraRef.current;
        if (last && !headingChanged) {
          const moved = haversineKm(last.lat, last.lon, focusNow.lat, focusNow.lon);
          if (moved < FOLLOW_MIN_MOVE_KM) return;
        }
      }
      forceNavCamera(false);
    },
    [forceNavCamera, resolveNavFocusNow, userHeading, isManualMapControl]
  );

  const applyNavCameraThrottled = useCallback(
    (force = false) => applyNavCamera(force),
    [applyNavCamera]
  );

  forceNavCameraRef.current = forceNavCamera;

  const fitRouteBounds = useCallback(
    (opts: { maxZoom: number; padding: { top: number; bottom: number; left: number; right: number } }) => {
      const map = mapInstance.current;
      const atlas = atlasRef.current;
      const pts = routePointsRef.current;
      if (!mapReadyRef.current || !map || !atlas || !pts || pts.length < 2) return;

      const simplified = simplifyRoutePoints(pts, ROUTE_POINTS_OVERVIEW_LINE, ROUTE_SIMPLIFY_OVERVIEW_KM).filter(
        (p) => isValidCoord(p.lat, p.lon)
      );
      if (simplified.length < 2) return;

      const positions = simplified.map((p) => [Number(p.lon), Number(p.lat)] as MapPosition);
      markProgrammaticCamera();
      try {
        map.setCamera(
          {
            bounds: atlas.data.BoundingBox.fromPositions(positions),
            padding: opts.padding,
            minZoom: ZOOM_MIN_OVERVIEW,
            maxZoom: opts.maxZoom,
            bearing: 0,
            pitch: 0,
          },
          CAMERA_JUMP
        );
      } catch {
        /* ignore invalid bounds */
      }
      routeRedrawRef.current?.(true);
    },
    [markProgrammaticCamera]
  );

  const showFullRouteOverview = useCallback(() => {
    fitRouteBounds({
      maxZoom: ZOOM_ROUTE_OVERVIEW_MAX,
      padding: { top: 96, bottom: 128, left: 40, right: 40 },
    });
  }, [fitRouteBounds]);

  const showPreviewRoute = useCallback(() => {
    fitRouteBounds({
      maxZoom: ZOOM_PREVIEW_MAX,
      padding: { top: 72, bottom: 220, left: 32, right: 32 },
    });
  }, [fitRouteBounds]);

  useEffect(() => {
    if (!mapReady || !routeOverviewActive || routeOverviewToken === 0) return;
    showFullRouteOverview();
  }, [mapReady, routeOverviewActive, routeOverviewToken, showFullRouteOverview]);

  useEffect(() => {
    if (!mapReady || mode !== 'preview' || previewFitToken === 0) return;
    showPreviewRoute();
  }, [mapReady, mode, previewFitToken, showPreviewRoute]);

  useEffect(() => {
    if (!mapReady || mode !== 'preview' || !routePoints || routePoints.length < 2) return;
    if (previewFitToken > 0) return;
    showPreviewRoute();
  }, [mapReady, mode, routePoints, selectedRouteId, previewFitToken, showPreviewRoute]);

  useEffect(() => {
    const container = mapRef.current;
    if (!container) return;
    if (mapInstance.current && mapInitRef.current) return;

    let disposed = false;
    mapInitRef.current = true;
    hasIdleCenteredRef.current = false;
    let map: MapInstance | null = null;

    const init = async () => {
      setMapError(null);
      await waitForElementSize(container);

      if (disposed || mapInstance.current) return;

      let atlas: AtlasNamespace;
      try {
        atlas = await loadAzureMaps();
        atlasRef.current = atlas;
      } catch {
        if (!disposed) setMapError('Não foi possível carregar o mapa. Verifique sua conexão.');
        return;
      }

      const colors = routeColorsForTheme(themeRef.current);
      map = new atlas.Map(container, {
        center: isValidCoord(userPosition.lat, userPosition.lon)
          ? [userPosition.lon, userPosition.lat]
          : [-48.548, -27.595],
        zoom: ZOOM_HOME,
        minZoom: ZOOM_MIN_NAV,
        style: mapStyleForTheme(themeRef.current),
        ...NORTH_UP_CAMERA,
        ...MAP_INTERACTION,
      });

      mapInstance.current = map;

      let webglCanvas: HTMLCanvasElement | null = null;
      const onContextLost = (e: Event) => {
        e.preventDefault();
        navPitchEnabledRef.current = false;
        lastNavBearingRef.current = 0;
        setMapError('Renderização do mapa interrompida. Toque em Recarregar mapa.');
      };
      const onContextRestored = () => {
        setMapError(null);
        resizeMapRef.current();
      };

      const ro = new ResizeObserver(() => resizeMap());
      ro.observe(container);

      const onVisible = () => {
        if (document.visibilityState === 'visible') resizeMap();
      };
      const onOrientation = () => resizeMap();
      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('orientationchange', onOrientation);

      map.events.add('ready', () => {
      if (disposed || !map) return;
      const routeDs = new atlas.source.DataSource();
      const altRouteDs = new atlas.source.DataSource();
      const destDs = new atlas.source.DataSource();
      map.sources.add(altRouteDs);
      map.sources.add(routeDs);
      map.sources.add(destDs);
      routeDsRef.current = routeDs;
      altRouteDsRef.current = altRouteDs;
      destDsRef.current = destDs;

      const baseLayers: atlas.layer.Layer[] = [
        new atlas.layer.LineLayer(altRouteDs, 'alt-route-line', {
          strokeColor: colors.alt,
          strokeWidth: 6,
          lineJoin: 'round',
          lineCap: 'round',
        }),
        new atlas.layer.LineLayer(routeDs, 'route-outline', {
          strokeColor: colors.casing,
          strokeWidth: 12,
          lineJoin: 'round',
          lineCap: 'round',
        }),
        new atlas.layer.LineLayer(routeDs, 'route-line', {
          strokeColor: colors.main,
          strokeWidth: 8,
          lineJoin: 'round',
          lineCap: 'round',
        }),
      ];

      map.layers.add(baseLayers);

      map.setUserInteraction(MAP_INTERACTION);
      // Só gesto do usuário pausa o follow. NÃO usar movestart/rotatestart:
      // a câmera de navegação (easeTo) dispara esses eventos e travava o GPS.
      map.events.add('dragstart', () => {
        if (!programmaticCameraRef.current) pauseGpsFollow();
      });
      map.events.add('dragend', () => {
        interactionEndRedrawRef.current?.();
      });
      map.events.add('zoomstart', () => {
        if (programmaticCameraRef.current) return;
        // easeTo da câmera de nav também dispara zoomstart — não tratar como pinça.
        if (typeof map.isEasing === 'function' && map.isEasing()) return;
        pauseGpsFollow(true);
      });
      const refreshMapView = () => {
        const z = map.getCamera()?.zoom;
        if (z != null && Number.isFinite(z)) setMapZoom(z);
        if (modeRef.current === 'navigate') setMapViewToken((t) => t + 1);
      };
      map.events.add('zoomend', () => {
        refreshMapView();
        if (!programmaticCameraRef.current && modeRef.current === 'navigate' && !routeOverviewRef.current) {
          const z = map.getCamera()?.zoom;
          if (z != null && Number.isFinite(z)) {
            const target = navTargetZoom(navPitchForViewport());
            if (Math.abs(z - target) > NAV_ZOOM_MANUAL_DELTA) {
              pauseGpsFollow(true);
            }
          }
        }
        interactionEndRedrawRef.current?.();
      });
      map.events.add('moveend', () => {
        refreshMapView();
        if (!followRef.current && modeRef.current === 'navigate') {
          interactionEndRedrawRef.current?.();
        }
      });
      map.events.add('error', (err: unknown) => {
        const msg = String((err as { error?: string })?.error ?? err ?? '');
        if (/webgl|context|tile|render/i.test(msg)) {
          navPitchEnabledRef.current = false;
        }
      });
      mapReadyRef.current = true;
      setMapReady(true);
      lastIdleCenterRef.current = null;
      resizeMap();
      setTimeout(resizeMap, 600);

      webglCanvas = container.querySelector('canvas');
      webglCanvas?.addEventListener('webglcontextlost', onContextLost);
      webglCanvas?.addEventListener('webglcontextrestored', onContextRestored);

      if (modeRef.current === 'idle' && isValidCoord(userPosition.lat, userPosition.lon)) {
        map.setCamera(
          {
            center: [userPosition.lon, userPosition.lat],
            zoom: ZOOM_HOME,
            minZoom: ZOOM_MIN_NAV,
            ...NORTH_UP_CAMERA,
          },
          CAMERA_JUMP
        );
        hasIdleCenteredRef.current = true;
        lastIdleCenterRef.current = { lat: userPosition.lat, lon: userPosition.lon };
      }
      });

      mapCleanupRef.current = () => {
        ro.disconnect();
        document.removeEventListener('visibilitychange', onVisible);
        window.removeEventListener('orientationchange', onOrientation);
        webglCanvas?.removeEventListener('webglcontextlost', onContextLost);
        webglCanvas?.removeEventListener('webglcontextrestored', onContextRestored);
      };
    };

    void init();

    return () => {
      disposed = true;
      mapCleanupRef.current?.();
      mapCleanupRef.current = null;
      mapReadyRef.current = false;
      setMapReady(false);
      mapInstance.current?.dispose();
      mapInstance.current = null;
      routeDsRef.current = null;
      destDsRef.current = null;
      altRouteDsRef.current = null;
      if (vehicleMarkerRef.current) {
        try {
          mapInstance.current?.markers.remove(vehicleMarkerRef.current);
        } catch {
          /* ignore */
        }
        vehicleMarkerRef.current = null;
      }
      if (destMarkerRef.current) {
        try {
          mapInstance.current?.markers.remove(destMarkerRef.current);
        } catch {
          /* ignore */
        }
        destMarkerRef.current = null;
      }
      alertMarkersRef.current = [];
      for (const marker of fuelMarkersRef.current) {
        try {
          mapInstance.current?.markers.remove(marker);
        } catch {
          /* ignore */
        }
      }
      fuelMarkersRef.current = [];
      atlasRef.current = null;
      mapInitRef.current = false;
    };
  }, [pauseGpsFollow, retryToken, mapTheme]);

  useEffect(() => {
    if (!mapReady || mode !== 'idle' || hasIdleCenteredRef.current) return;
    if (!isValidCoord(userPosition.lat, userPosition.lon)) return;
    hasIdleCenteredRef.current = true;
    lastIdleCenterRef.current = { lat: userPosition.lat, lon: userPosition.lon };
    centerOnUser(ZOOM_HOME);
  }, [mapReady, mode, centerOnUser, userPosition.lat, userPosition.lon]);

  useEffect(() => {
    if (!mapReadyRef.current) return;
    if (mode === 'navigate') {
      const t = setTimeout(() => {
        resizeMapRef.current();
      }, 900);
      return () => clearTimeout(t);
    }
    resizeMap();
  }, [mode, layoutKey, resizeMap, mapReady]);

  const runNavigationStartup = useCallback(
    (forceRouteStart: boolean) => {
      if (!mapReadyRef.current || modeRef.current !== 'navigate') return;
      syncNavAnchor();
      if (forceRouteStart) {
        navSnapToStartUntilRef.current = Date.now() + NAV_SNAP_TO_START_MS;
        navFollowPauseUntilRef.current = 0;
        navCameraGuardUntilRef.current = Date.now() + NAV_CAMERA_GUARD_MS;
        lastNavBearingRef.current = null;
        manualExploreLockRef.current = false;
        navPitchEnabledRef.current = true;
        followRef.current = true;
        onFollowChangeRef.current?.(true);
      }
      if (
        !forceRouteStart &&
        (manualExploreLockRef.current || !followRef.current || routeOverviewRef.current)
      ) {
        routeRedrawRef.current?.(true);
        return;
      }
      lastCameraRef.current = null;
      lastFollowMsRef.current = 0;
      routeRedrawRef.current?.(true);
      forceNavCamera(forceRouteStart, true, true);
    },
    [forceNavCamera, syncNavAnchor]
  );

  useEffect(() => {
    if (mode !== 'navigate') {
      navSnapToStartUntilRef.current = 0;
      lastNavBearingRef.current = null;
      lastAppliedHeadingRef.current = null;
      navPitchEnabledRef.current = true;
      manualExploreLockRef.current = false;
      return;
    }
    if (!mapReady) return;

    if (navigationStartToken > 0 && navStartHandledTokenRef.current !== navigationStartToken) {
      navStartHandledTokenRef.current = navigationStartToken;
      runNavigationStartup(true);
      const t1 = setTimeout(() => {
        if (!manualExploreLockRef.current && followRef.current) {
          forceNavCameraRef.current(false, true, true);
        }
      }, 600);
      return () => {
        clearTimeout(t1);
      };
    }
  }, [mode, mapReady, navigationStartToken, runNavigationStartup]);

  useEffect(() => {
    if (recenterToken === 0) return;
    manualExploreLockRef.current = false;
    navFollowPauseUntilRef.current = 0;
    navPitchEnabledRef.current = true;
    followRef.current = true;
    onFollowChangeRef.current?.(true);
    lastCameraRef.current = null;
    lastFollowMsRef.current = 0;
    lastNavBearingRef.current = null;
    routeRedrawRef.current?.(true);
    forceNavCameraRef.current(false, true, true);
  }, [recenterToken]);

  const drawRouteLine = useCallback((force = false) => {
    const routeDs = routeDsRef.current;
    const atlas = atlasRef.current;
    const map = mapInstance.current;
    if (!mapReadyRef.current || !routeDs || !atlas || !map) return;

    if (!force && modeRef.current === 'navigate' && followRef.current && !routeOverviewRef.current) {
      const now = Date.now();
      if (now - lastRouteDrawMsRef.current < 1200) return;
    }
    lastRouteDrawMsRef.current = Date.now();
    if (!routePoints || routePoints.length < 2) {
      routeDs.clear();
      return;
    }

    const currentMode = modeRef.current;
    const snapToStart = Date.now() < navSnapToStartUntilRef.current;
    const manualExplore = isManualMapExplore(
      currentMode,
      routeOverviewRef.current,
      followRef.current
    );
    let focus =
      currentMode === 'navigate' && routePoints.length >= 2
        ? resolveRouteFocus(userPosition, routePoints, routeOrigin, snapToStart)
        : userPosition;
    if (manualExplore) {
      const camFocus = mapCameraCenter(map);
      if (camFocus) focus = camFocus;
    }
    const zoom = map.getCamera()?.zoom ?? null;
    const fullView = shouldDrawFullRoute(
      currentMode,
      routeOverviewRef.current,
      followRef.current,
      zoom
    );
    const simplified = routePointsForDisplay(routePoints, currentMode, focus, {
      fullRouteView: fullView,
      zoom,
    }).filter((p) => isValidCoord(p.lat, p.lon));
    if (simplified.length < 2) return;

    const positions = simplified
      .map((p) => [Number(p.lon), Number(p.lat)] as MapPosition)
      .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat));
    if (positions.length < 2) return;
    routeDs.clear();
    routeDs.add(new atlas.data.Feature(new atlas.data.LineString(positions)));
  }, [routePoints, mode, userPosition.lat, userPosition.lon, routeOrigin?.lat, routeOrigin?.lon]);

  routeRedrawRef.current = drawRouteLine;

  const drawAlternativeRoutes = useCallback(() => {
    const altDs = altRouteDsRef.current;
    const atlas = atlasRef.current;
    if (!mapReadyRef.current || !altDs || !atlas || modeRef.current !== 'preview') {
      altDs?.clear();
      return;
    }
    altDs.clear();
    if (!routeAlternatives?.length) return;

    const activeId = selectedRouteId ?? routeAlternatives[0]?.id;
    for (const alt of routeAlternatives) {
      if (alt.id === activeId || alt.points.length < 2) continue;
      const simplified = simplifyRoutePoints(alt.points, ROUTE_POINTS_PREVIEW_MAX, ROUTE_SIMPLIFY_MIN_KM).filter(
        (p) => isValidCoord(p.lat, p.lon)
      );
      if (simplified.length < 2) continue;
      const positions = simplified.map(
        (p) => [Number(p.lon), Number(p.lat)] as MapPosition
      );
      altDs.add(new atlas.data.Feature(new atlas.data.LineString(positions), { id: alt.id }));
    }
  }, [routeAlternatives, selectedRouteId]);

  useEffect(() => {
    drawAlternativeRoutes();
  }, [drawAlternativeRoutes, mapReady, mode]);

  useEffect(() => {
    drawRouteLine();

    const atlas = atlasRef.current;
    const map = mapInstance.current;
    if (!atlas || !map || !routePoints || routePoints.length < 2) return;

    const snapToStart = Date.now() < navSnapToStartUntilRef.current;
    const manualExplore = isManualMapExplore(mode, routeOverviewActive, followingGps);
    let focus =
      mode === 'navigate'
        ? resolveRouteFocus(userPosition, routePoints, routeOrigin, snapToStart)
        : userPosition;
    if (manualExplore) {
      const camFocus = mapCameraCenter(map);
      if (camFocus) focus = camFocus;
    }
    const mapZoom = map.getCamera()?.zoom ?? null;
    const fullView = shouldDrawFullRoute(mode, routeOverviewActive, followingGps, mapZoom);
    const simplified = routePointsForDisplay(routePoints, mode, focus, {
      fullRouteView: fullView,
      zoom: mapZoom,
    }).filter((p) => isValidCoord(p.lat, p.lon));
    if (simplified.length < 2) return;

    const positions = simplified.map((p) => [p.lon, p.lat] as MapPosition);
    const key = `${routePoints.length}-${routePoints[0]?.lat}-${routePoints.at(-1)?.lat}-${mode}`;
    const modeChanged = key !== routeKeyRef.current;
    if (modeChanged) {
      routeKeyRef.current = key;
      if (mode === 'navigate') {
        syncNavAnchor();
        navSnapToStartUntilRef.current = Date.now() + NAV_SNAP_TO_START_MS;
        navCameraGuardUntilRef.current = Date.now() + NAV_CAMERA_GUARD_MS;
        lastCameraRef.current = null;
        lastFollowMsRef.current = 0;
        forceNavCamera(true, true, true);
      } else {
        try {
          map.setCamera(
            {
              bounds: atlas.data.BoundingBox.fromPositions(positions),
              padding: { top: 72, bottom: 220, left: 32, right: 32 },
              maxZoom: ZOOM_PREVIEW_MAX,
              minZoom: ZOOM_MIN_OVERVIEW,
              ...NORTH_UP_CAMERA,
            },
            CAMERA_JUMP
          );
        } catch {
          /* ignore invalid bounds */
        }
      }
    }
  }, [
    routePoints,
    mode,
    mapReady,
    drawRouteLine,
    forceNavCamera,
    syncNavAnchor,
    userPosition.lat,
    userPosition.lon,
    routeOrigin?.lat,
    routeOrigin?.lon,
    routeOverviewActive,
    followingGps,
  ]);

  useEffect(() => {
    if (!mapReady) return;
    drawRouteLine(true);
  }, [mapReady, routeOverviewActive, followingGps, previewFitToken, drawRouteLine]);

  useEffect(() => {
    const map = mapInstance.current;
    if (!mapReadyRef.current || !map) return;
    const exploring = routeOverviewActive || !followingGps || mode !== 'navigate';
    try {
      // Nunca limitar o zoom máximo (isso quebrava a navegação ao arrastar/pinçar).
      map.setMaxZoom?.(NAV_MAP_MAX_ZOOM);
      map.setMinZoom?.(exploring ? ZOOM_MIN_OVERVIEW : Math.min(ZOOM_MIN_NAV, NAV_MAP_MIN_ZOOM));
    } catch {
      /* ignore */
    }
  }, [mapReady, routeOverviewActive, followingGps, mode]);

  useEffect(() => {
    if (!mapReady || mode !== 'navigate') return;
    manualExploreLockRef.current = false;
    navFollowPauseUntilRef.current = 0;
    navPitchEnabledRef.current = true;
    const t = window.setTimeout(() => {
      forceNavCameraRef.current(true, true, true);
    }, 50);
    return () => window.clearTimeout(t);
  }, [mapReady, mode, navigationStartToken]);

  useEffect(() => {
    if (!mapReady || mode !== 'navigate' || routeOverviewActive) return;
    const enforce = () => {
      if (modeRef.current !== 'navigate' || routeOverviewRef.current) return;
      const map = mapInstance.current;
      if (!map) return;

      // Enquanto o usuário arrasta/pinça: NÃO força câmera e NÃO volta sozinho ao follow.
      // Só o botão Recentralizar reativa (estilo Waze).
      if (!followRef.current || manualExploreLockRef.current) return;
      if (Date.now() < navFollowPauseUntilRef.current) return;

      const cam = map.getCamera();
      const zoom = cam?.zoom ?? 0;
      // Se o zoom caiu demais (bug/macro), recupera a visão próxima.
      if (zoom < ZOOM_NAV_MIN_ACTIVE - 0.8) {
        forceNavCameraRef.current(false, true, true);
      }
    };
    enforce();
    const id = window.setInterval(enforce, 2000);
    return () => window.clearInterval(id);
  }, [mapReady, mode, followingGps, routeOverviewActive, navigationStartToken]);

  useEffect(() => {
    if (!mapReadyRef.current || mode !== 'navigate') return;
    if (Date.now() > navCameraGuardUntilRef.current) return;

    const tick = () => {
      if (modeRef.current !== 'navigate' || Date.now() > navCameraGuardUntilRef.current) return;
      if (routeOverviewRef.current || !followRef.current || manualExploreLockRef.current) return;
      if (Date.now() < navFollowPauseUntilRef.current) return;
      const map = mapInstance.current;
      if (!map) return;
      const cam = map.getCamera();
      const zoom = cam?.zoom;
      const center = cam?.center;
      const snapActive = Date.now() < navSnapToStartUntilRef.current;
      if (zoom == null || !Number.isFinite(zoom) || zoom < ZOOM_NAV_MIN_ACTIVE) {
        forceNavCamera(snapActive, true, true);
        return;
      }
      if (!center || center.length < 2) {
        forceNavCamera(snapActive);
        return;
      }
      const [lon, lat] = center;
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
        forceNavCamera(snapActive);
        return;
      }
    };

    tick();
    const id = window.setInterval(tick, 600);
    return () => window.clearInterval(id);
  }, [mode, mapReady, navigationStartToken, forceNavCamera, resolveNavFocusNow]);

  useEffect(() => {
    followRef.current = followingGps;
    if (followingGps || routeOverviewActive) {
      if (followingGps) {
        manualExploreLockRef.current = false;
        navFollowPauseUntilRef.current = 0;
      }
    } else if (!routeOverviewRef.current) {
      manualExploreLockRef.current = true;
    }
  }, [followingGps, routeOverviewActive]);

  useEffect(() => {
    if (!routeOverviewActive) return;
    manualExploreLockRef.current = false;
    navFollowPauseUntilRef.current = 0;
    routeRedrawRef.current?.(true);
  }, [routeOverviewActive, routeOverviewToken]);

  useEffect(() => {
    if (!mapReadyRef.current || mode !== 'navigate' || !followRef.current) return;
    if (routeOverviewRef.current || manualExploreLockRef.current) return;
    if (Date.now() < navFollowPauseUntilRef.current) return;
    drawRouteLine();
    applyNavCameraThrottled();
  }, [userPosition.lat, userPosition.lon, applyNavCameraThrottled, drawRouteLine]);

  useEffect(() => {
    if (!mapReadyRef.current || mode !== 'navigate' || !followRef.current) return;
    if (routeOverviewRef.current || manualExploreLockRef.current) return;
    if (Date.now() < navFollowPauseUntilRef.current) return;
    applyNavCameraThrottled();
  }, [userHeading, userSpeedMps, mode, applyNavCameraThrottled]);

  useEffect(() => {
    const map = mapInstance.current;
    const atlas = atlasRef.current;
    if (!mapReadyRef.current || !map || !atlas) return;

    if (mode !== 'navigate' && mode !== 'preview') {
      if (vehicleMarkerRef.current) {
        map.markers.remove(vehicleMarkerRef.current);
        vehicleMarkerRef.current = null;
      }
      return;
    }

    const snapToStart = Date.now() < navSnapToStartUntilRef.current;
    const focus =
      routePoints && routePoints.length >= 2 && mode === 'navigate'
        ? resolveRouteFocus(userPosition, routePoints, routeOrigin, snapToStart)
        : userPosition;
    if (!isValidCoord(focus.lat, focus.lon)) return;

    const prev = lastVehiclePosRef.current;
    let heading =
      mode === 'navigate' && routePoints && routePoints.length >= 2
        ? resolveNavHeading(
            focus,
            userHeading,
            userSpeedMps,
            routePoints,
            prev,
            lastVehicleHeadingRef.current
          )
        : userHeading;
    if ((heading == null || Number.isNaN(heading)) && prev) {
      const moved = haversineKm(prev.lat, prev.lon, focus.lat, focus.lon);
      if (moved > 0.008) {
        heading = bearingDeg(prev.lat, prev.lon, focus.lat, focus.lon);
      }
    }
    if (heading == null || Number.isNaN(heading)) {
      heading = lastVehicleHeadingRef.current;
    } else {
      lastVehicleHeadingRef.current = heading;
    }
    lastVehiclePosRef.current = { lat: focus.lat, lon: focus.lon };

    // Rotação relativa ao mapa: seta sempre alinhada ao rumo geográfico na tela,
    // mesmo se o follow estiver pausado (mapa north-up / arrastado).
    const mapBearing = map.getCamera()?.bearing ?? 0;
    const absHeading = heading ?? 0;
    const screenRot =
      mode === 'navigate'
        ? (((absHeading - mapBearing) % 360) + 360) % 360
        : absHeading;
    const html = vehicleMarkerHtml(screenRot, false);
    const pos: MapPosition = [Number(focus.lon), Number(focus.lat)];

    if (vehicleMarkerRef.current) {
      const existing = vehicleMarkerRef.current as HtmlMarkerInstance & {
        setLngLat?: (p: MapPosition) => void;
        setHtmlContent?: (h: string) => void;
      };
      existing.setLngLat?.(pos);
      existing.setHtmlContent?.(html);
      return;
    }

    const marker = new atlas.HtmlMarker({
      position: pos,
      htmlContent: html,
      anchor: 'center',
      zIndex: 600,
      pitchAlignment: 'viewport',
    });
    map.markers.add(marker);
    vehicleMarkerRef.current = marker;
  }, [
    userPosition.lat,
    userPosition.lon,
    userHeading,
    userSpeedMps,
    mapReady,
    mode,
    routePoints,
    routeOrigin?.lat,
    routeOrigin?.lon,
    mapViewToken,
  ]);

  useEffect(() => {
    const map = mapInstance.current;
    if (!mapReady || !map) return;

    const clearTurnMarker = () => {
      if (turnMarkerRef.current) {
        try {
          map.markers.remove(turnMarkerRef.current);
        } catch {
          /* ignore */
        }
        turnMarkerRef.current = null;
      }
    };

    if (mode !== 'navigate' || !nextManeuver || !isValidCoord(nextManeuver.lat, nextManeuver.lon)) {
      clearTurnMarker();
      return;
    }

    const distKm = haversineKm(
      userPosition.lat,
      userPosition.lon,
      nextManeuver.lat,
      nextManeuver.lon
    );
    // Só mostra a seta de curva à frente (nunca muito perto = “atrás” do puck).
    if (distKm < 0.05 || distKm > 2.5) {
      clearTurnMarker();
      return;
    }

    const atlas = atlasRef.current;
    if (!atlas) return;

    // Roda a seta no sentido da via (Waze: seta branca “em cima” da rota).
    let approach = 0;
    if (routePoints && routePoints.length >= 2) {
      let bestI = 0;
      let bestD = Infinity;
      for (let i = 0; i < routePoints.length; i++) {
        const d = haversineKm(nextManeuver.lat, nextManeuver.lon, routePoints[i].lat, routePoints[i].lon);
        if (d < bestD) {
          bestD = d;
          bestI = i;
        }
      }
      const from = routePoints[Math.max(0, bestI - 4)];
      const to = routePoints[bestI];
      approach = bearingDeg(from.lat, from.lon, to.lat, to.lon);
    }

    if (turnMarkerRef.current) {
      map.markers.remove(turnMarkerRef.current);
    }
    const marker = new atlas.HtmlMarker({
      position: [Number(nextManeuver.lon), Number(nextManeuver.lat)],
      htmlContent: turnMapMarkerHtml(nextManeuver.instructionType, nextManeuver.message),
      anchor: 'center',
      zIndex: 520,
      pitchAlignment: 'map',
      rotationAlignment: 'map',
    });
    map.markers.add(marker);
    (marker as HtmlMarkerInstance & { setRotation?: (d: number) => void }).setRotation?.(approach);
    turnMarkerRef.current = marker;

    return clearTurnMarker;
  }, [mode, mapReady, nextManeuver, userPosition.lat, userPosition.lon, routePoints]);

  useEffect(() => {
    const map = mapInstance.current;
    const atlas = atlasRef.current;
    if (!mapReadyRef.current || !map || !atlas) return;

    const clearDest = () => {
      if (destMarkerRef.current) {
        try {
          map.markers.remove(destMarkerRef.current);
        } catch {
          /* ignore */
        }
        destMarkerRef.current = null;
      }
      destDsRef.current?.clear();
    };

    const showDest =
      destination &&
      (mode === 'preview' || mode === 'navigate' || mode === 'idle') &&
      isValidCoord(destination.lat, destination.lon);

    if (!showDest) {
      clearDest();
      return;
    }

    const pos: MapPosition = [Number(destination.lon), Number(destination.lat)];
    if (destMarkerRef.current) {
      const existing = destMarkerRef.current as HtmlMarkerInstance & {
        setLngLat?: (p: MapPosition) => void;
        setHtmlContent?: (h: string) => void;
      };
      existing.setLngLat?.(pos);
      existing.setHtmlContent?.(destinationMarkerHtml());
      return;
    }

    const marker = new atlas.HtmlMarker({
      position: pos,
      htmlContent: destinationMarkerHtml(),
      anchor: 'bottom',
      zIndex: 350,
    });
    map.markers.add(marker);
    destMarkerRef.current = marker;

    return clearDest;
  }, [destination, mode, mapReady]);

  // Ficha de local: aproximar o pin sem estar em previsão de rota.
  useEffect(() => {
    const map = mapInstance.current;
    if (!mapReady || !map || mode !== 'idle' || !destination) return;
    if (!isValidCoord(destination.lat, destination.lon)) return;
    if (layoutKey !== 'place-detail') return;
    markProgrammaticCamera();
    try {
      map.setCamera(
        {
          center: [Number(destination.lon), Number(destination.lat)],
          zoom: ZOOM_HOME,
          bearing: 0,
          pitch: 0,
        },
        CAMERA_EASE
      );
    } catch {
      /* ignore */
    }
  }, [destination?.lat, destination?.lon, mode, mapReady, layoutKey, markProgrammaticCamera]);

  useEffect(() => {
    const atlas = atlasRef.current;
    const map = mapInstance.current;
    if (!mapReadyRef.current || !atlas || !map) return;

    const clearHtmlMarkers = () => {
      for (const marker of alertMarkersRef.current) {
        try {
          map.markers.remove(marker);
        } catch {
          /* ignore */
        }
      }
      alertMarkersRef.current = [];
    };

    clearHtmlMarkers();

    if (!roadAlerts?.length || (mode !== 'navigate' && mode !== 'preview')) return;

    const zoom = mapZoom ?? map.getCamera()?.zoom ?? null;
    const mapFocus = mapCameraCenter(map) ?? userPosition;
    const visible = pickAlertsForMap(roadAlerts, mode, userPosition, routePoints, {
      zoom,
      routeOverview: routeOverviewActive,
      mapFocus,
      visibleRadiusKm: visibleRadiusKmForZoom(zoom),
      maxCount: ALERTS_MAX_PREVIEW,
    });

    const showDetailIcons = zoom == null || zoom >= 9;
    if (!showDetailIcons) return;

    for (const raw of visible) {
      if (!isMapAlertType(raw.type)) continue;
      const alert = offsetAlertFromManeuver(raw, nextManeuver, routePoints);

      const marker = new atlas.HtmlMarker({
        position: [Number(alert.lon), Number(alert.lat)],
        htmlContent: alertMarkerHtml(alert.type, zoom),
        anchor: 'center',
        zIndex: 480,
      });
      map.markers.add(marker);
      alertMarkersRef.current.push(marker);
    }
  }, [
    roadAlerts,
    mode,
    mapReady,
    mapZoom,
    mapViewToken,
    routePoints,
    routeOverviewActive,
    followingGps,
    userPosition.lat,
    userPosition.lon,
    nextManeuver,
  ]);

  useEffect(() => {
    const atlas = atlasRef.current;
    const map = mapInstance.current;
    if (!mapReadyRef.current || !atlas || !map) return;

    for (const marker of fuelMarkersRef.current) {
      try {
        map.markers.remove(marker);
      } catch {
        /* ignore */
      }
    }
    fuelMarkersRef.current = [];

    if (!fuelPois?.length || mode === 'idle') return;

    const zoom = mapZoom ?? map.getCamera()?.zoom ?? null;
    const visible = pickFuelPoisForMap(fuelPois, mode, userPosition, routePoints, {
      routeOverview: routeOverviewActive,
    });

    for (const poi of visible) {
      const marker = new atlas.HtmlMarker({
        position: [Number(poi.lon), Number(poi.lat)],
        htmlContent: fuelMarkerHtml(zoom, poi.name),
        anchor: 'bottom',
        zIndex: 850,
      });
      map.markers.add(marker);
      const el = marker.getElement?.();
      if (el && onFuelPoiClick) {
        el.style.pointerEvents = 'auto';
        el.style.cursor = 'pointer';
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          onFuelPoiClick(poi);
        });
      }
      fuelMarkersRef.current.push(marker);
    }
  }, [
    fuelPois,
    mode,
    mapReady,
    mapZoom,
    mapViewToken,
    routePoints,
    routeOverviewActive,
    userPosition.lat,
    userPosition.lon,
    onFuelPoiClick,
  ]);

  return (
    <div className="map-wrapper">
      <div id="map" ref={mapRef} className="map-canvas" />
      {mapError && (
        <div className="map-error-overlay">
          <p>{mapError}</p>
          <button type="button" onClick={() => { setRetryToken((t) => t + 1); setMapError(null); }}>
            Recarregar mapa
          </button>
        </div>
      )}
    </div>
  );
}
