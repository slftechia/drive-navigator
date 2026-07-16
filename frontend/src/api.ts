const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

const API_TIMEOUT_MS = 25000;
const API_RETRY_DELAY_MS = 2500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isNetworkFetchError(err: unknown): boolean {
  if (err instanceof TypeError) {
    return /fetch failed|failed to fetch|networkerror|load failed/i.test(err.message);
  }
  return false;
}

function formatApiError(err: unknown): Error {
  if (err instanceof DOMException && err.name === 'AbortError') {
    return new Error('A requisição demorou demais. Tente novamente.');
  }
  if (isNetworkFetchError(err)) {
    return new Error('Sem conexão com o servidor. Verifique a internet e tente de novo.');
  }
  if (err instanceof Error) return err;
  return new Error(String(err));
}

export interface GeocodeResult {
  lat: number;
  lon: number;
  formattedAddress: string;
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
  resultKind?: 'poi' | 'street' | 'address' | 'admin';
}

export interface RoutePoint {
  lat: number;
  lon: number;
}

export interface RouteInstruction {
  message: string;
  lat: number;
  lon: number;
  distanceMeters: number;
  instructionType?: string;
}

export interface RouteAlternative {
  id: string;
  kind: 'with_tolls' | 'no_tolls';
  label: string;
  totalDistanceKm: number;
  totalDurationMinutes: number;
  hasTolls: boolean;
  tollCount: number;
  tollCostEstimateBrl: number | null;
  legs: Array<{ summary: { lengthInMeters: number; travelTimeInSeconds: number }; points: RoutePoint[] }>;
  instructions?: RouteInstruction[];
  boundingBox?: {
    northEast: RoutePoint;
    southWest: RoutePoint;
  };
}

export interface RoadAlert {
  id: string;
  type:
    | 'radar'
    | 'lombada'
    | 'policia'
    | 'acidente'
    | 'congestionamento'
    | 'perigo'
    | 'obra'
    | 'via_fechada'
    | 'carro_parado'
    | 'animal'
    | 'clima';
  lat: number;
  lon: number;
  label: string;
}

export interface PoiResult {
  id: string;
  name: string;
  category: string;
  lat: number;
  lon: number;
  address?: string;
}

export interface FuelAlert {
  remainingKm: number;
  status: 'ok' | 'warning' | 'critical';
  message: string;
  nearestStation?: PoiResult;
  lastSafeStation?: PoiResult;
}

export interface TripPlan {
  origin?: { lat: number; lon: number };
  destination: { lat: number; lon: number; address: string; locationTag?: string };
  waypoints?: Array<{ lat: number; lon: number }>;
  route: {
    legs: Array<{ summary: { lengthInMeters: number; travelTimeInSeconds: number }; points: RoutePoint[] }>;
    totalDistanceKm: number;
    totalDurationMinutes: number;
    instructions?: RouteInstruction[];
    boundingBox?: {
      northEast: RoutePoint;
      southWest: RoutePoint;
    };
  };
  routeAlternatives?: RouteAlternative[];
  selectedRouteId?: string;
  pois: PoiResult[];
  roadAlerts?: RoadAlert[];
  fuelAlert: FuelAlert;
  scheduledStops: Array<{ type: string; message: string; minutesUntil: number }>;
}

export interface VehicleConfig {
  name: string;
  autonomyKm: number;
  currentFuelKm: number;
  fuelReserveKm: number;
  stopIntervalMinutes: number;
}

async function apiFetch<T>(
  path: string,
  options?: RequestInit & { timeoutMs?: number; retries?: number }
): Promise<T> {
  const { timeoutMs = API_TIMEOUT_MS, retries = 0, ...fetchOptions } = options ?? {};
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        headers: { 'Content-Type': 'application/json', ...fetchOptions.headers },
        signal: controller.signal,
        ...fetchOptions,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error((err as { error?: string }).error ?? `Erro na API (${res.status})`);
      }
      return (await res.json()) as T;
    } catch (err) {
      lastErr = err;
      if (
        attempt < retries &&
        (isNetworkFetchError(err) || (err instanceof DOMException && err.name === 'AbortError'))
      ) {
        await sleep(API_RETRY_DELAY_MS);
        continue;
      }
      throw formatApiError(err);
    } finally {
      clearTimeout(timer);
    }
  }
  throw formatApiError(lastErr);
}

export async function checkHealth(): Promise<{ status: string }> {
  return apiFetch('/health');
}

export async function fetchMapsKey(): Promise<string> {
  return '';
}

export async function geocodeAddress(query: string): Promise<GeocodeResult> {
  return apiFetch(`/geocode?q=${encodeURIComponent(query)}`);
}

export async function searchSuggestions(
  query: string,
  lat?: number,
  lon?: number,
  onPartial?: (results: AddressSuggestion[]) => void
): Promise<AddressSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  let searchLat = lat;
  let searchLon = lon;
  if (
    searchLat == null ||
    searchLon == null ||
    !Number.isFinite(searchLat) ||
    !Number.isFinite(searchLon)
  ) {
    try {
      const pos = await getCurrentPosition();
      searchLat = pos.coords.latitude;
      searchLon = pos.coords.longitude;
    } catch {
      /* busca nacional sem GPS */
    }
  }

  try {
    const { searchSuggestionsDirect } = await import('./lib/mapsSearch');
    const direct = await searchSuggestionsDirect(trimmed, searchLat, searchLon, onPartial);
    if (direct.length > 0) return direct;
  } catch {
    /* tenta API abaixo */
  }

  const params = new URLSearchParams({ q: trimmed });
  if (searchLat !== undefined) params.set('lat', String(searchLat));
  if (searchLon !== undefined) params.set('lon', String(searchLon));
  try {
    const data = await apiFetch<{ suggestions: AddressSuggestion[] }>(
      `/search/suggestions?${params.toString()}`,
      { timeoutMs: 20_000 }
    );
    return data.suggestions;
  } catch {
    return [];
  }
}

function sampleRoutePointsForApi(points: RoutePoint[], max = 3500): RoutePoint[] {
  if (points.length <= max) return points;
  const out: RoutePoint[] = [];
  const step = (points.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) {
    out.push(points[Math.min(Math.round(i * step), points.length - 1)]);
  }
  return out;
}

export async function fetchSpeedLimit(lat: number, lon: number): Promise<{
  speedLimitKmh: number | null;
  source: 'osm' | 'none';
}> {
  return apiFetch('/trip/speed-limit', {
    method: 'POST',
    body: JSON.stringify({ lat, lon }),
    timeoutMs: 12000,
  });
}

export async function fetchRoadAlerts(routePoints: RoutePoint[]): Promise<RoadAlert[]> {
  if (routePoints.length < 2) return [];
  const { fetchRoadAlertsDirect } = await import('./lib/roadAlertsDirect');
  const { snapAlertsToRoute } = await import('./lib/roadAlerts');
  const alerts = await fetchRoadAlertsDirect(routePoints);
  return snapAlertsToRoute(alerts, routePoints, 0.28);
}

export async function fetchRoadAlertsNear(lat: number, lon: number, radiusM = 3500): Promise<RoadAlert[]> {
  try {
    const data = await apiFetch<{ roadAlerts: RoadAlert[] }>('/trip/road-alerts-near', {
      method: 'POST',
      body: JSON.stringify({ lat, lon, radiusM }),
      timeoutMs: 15000,
    });
    if (data.roadAlerts?.length) return data.roadAlerts;
  } catch {
    /* fallback abaixo */
  }
  const { fetchRoadAlertsDirect } = await import('./lib/roadAlertsDirect');
  return fetchRoadAlertsDirect([
    { lat, lon },
    { lat: lat + 0.02, lon: lon + 0.02 },
  ]);
}

export async function fetchTripPois(params: {
  routePoints: RoutePoint[];
  categories?: string[];
}): Promise<{ pois: PoiResult[] }> {
  return apiFetch('/trip/pois', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function planTrip(params: {
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
  categories?: string[];
}): Promise<TripPlan> {
  const { planTripDirect } = await import('./lib/tripPlanDirect');
  return planTripDirect(params);
}

/** Enriquece rota rápida com alternativas/pedágios da API (segundo plano). */
export async function enrichTripFromApi(
  params: Parameters<typeof planTrip>[0],
  current: TripPlan
): Promise<TripPlan> {
  try {
    const api = await apiFetch<TripPlan>('/trip/plan', {
      method: 'POST',
      body: JSON.stringify(params),
      timeoutMs: 22_000,
      retries: 0,
    });
    return {
      ...api,
      pois: current.pois?.length ? current.pois : api.pois,
      roadAlerts: current.roadAlerts?.length ? current.roadAlerts : api.roadAlerts,
    };
  } catch {
    return current;
  }
}

export async function getFuelStatus(params: {
  currentLat: number;
  currentLon: number;
  remainingFuelKm: number;
  fuelReserveKm: number;
  routePoints?: RoutePoint[];
}): Promise<FuelAlert> {
  return apiFetch('/fuel/status', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export interface CommunityReport {
  id: string;
  type: RoadAlert['type'];
  lat: number;
  lon: number;
  label: string;
  createdAt: number;
  confirms: number;
}

export async function submitCommunityReport(params: {
  type: RoadAlert['type'];
  lat: number;
  lon: number;
  label?: string;
}): Promise<CommunityReport | null> {
  try {
    const data = await apiFetch<{ report: CommunityReport }>('/reports', {
      method: 'POST',
      body: JSON.stringify(params),
      timeoutMs: 10_000,
    });
    return data.report;
  } catch {
    return null;
  }
}

export async function fetchCommunityReportsNear(
  lat: number,
  lon: number,
  radiusKm = 30
): Promise<RoadAlert[]> {
  try {
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      radiusKm: String(radiusKm),
    });
    const data = await apiFetch<{ reports: CommunityReport[] }>(`/reports?${params}`, {
      timeoutMs: 10_000,
    });
    return (data.reports ?? []).map((r) => ({
      id: r.id,
      type: r.type,
      lat: r.lat,
      lon: r.lon,
      label: r.confirms > 1 ? `${r.label} · ${r.confirms}x` : r.label,
    }));
  } catch {
    return [];
  }
}

export async function fetchCommunityReportsAlongRoute(
  routePoints: RoutePoint[]
): Promise<RoadAlert[]> {
  try {
    const data = await apiFetch<{ reports: CommunityReport[] }>('/reports/along-route', {
      method: 'POST',
      body: JSON.stringify({ routePoints: sampleRoutePointsForApi(routePoints, 400) }),
      timeoutMs: 12_000,
    });
    return (data.reports ?? []).map((r) => ({
      id: r.id,
      type: r.type,
      lat: r.lat,
      lon: r.lon,
      label: r.confirms > 1 ? `${r.label} · ${r.confirms}x` : r.label,
    }));
  } catch {
    return [];
  }
}

export function loadVehicleConfig(): VehicleConfig {
  const saved = localStorage.getItem('drive-nav-vehicle');
  if (saved) return JSON.parse(saved) as VehicleConfig;
  return {
    name: 'Meu Veículo',
    autonomyKm: 500,
    currentFuelKm: 450,
    fuelReserveKm: 50,
    stopIntervalMinutes: 120,
  };
}

export function saveVehicleConfig(config: VehicleConfig): void {
  localStorage.setItem('drive-nav-vehicle', JSON.stringify(config));
}

function readPosition(
  highAccuracy: boolean
): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: highAccuracy,
      timeout: highAccuracy ? 25_000 : 35_000,
      maximumAge: highAccuracy ? 8_000 : 120_000,
    });
  });
}

export function getCurrentPosition(): Promise<GeolocationPosition> {
  if (!navigator.geolocation) {
    return Promise.reject(new Error('Geolocalização não suportada'));
  }
  return readPosition(true).catch(() => readPosition(false));
}

export function watchPosition(
  onUpdate: (pos: GeolocationPosition) => void,
  onError?: (err: GeolocationPositionError) => void
): number {
  return navigator.geolocation.watchPosition(onUpdate, onError, {
    enableHighAccuracy: true,
    maximumAge: 1_000,
    timeout: 15_000,
  });
}

export function isGpsPermissionDenied(err: GeolocationPositionError): boolean {
  return err.code === err.PERMISSION_DENIED;
}
