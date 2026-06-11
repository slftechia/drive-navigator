const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

const API_TIMEOUT_MS = 25000;
const PLAN_TRIP_TIMEOUT_MS = 90000;
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
  type: 'radar' | 'lombada' | 'perigo';
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
  lon?: number
): Promise<AddressSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];

  // Autocomplete: Photon direto no browser (rapido; evita cold start do Render Free).
  try {
    const { searchSuggestionsDirect } = await import('./lib/mapsSearch');
    const direct = await searchSuggestionsDirect(trimmed, lat, lon);
    if (direct.length > 0) return direct;
  } catch {
    /* tenta API abaixo */
  }

  const params = new URLSearchParams({ q: trimmed });
  if (lat !== undefined) params.set('lat', String(lat));
  if (lon !== undefined) params.set('lon', String(lon));
  try {
    const data = await apiFetch<{ suggestions: AddressSuggestion[] }>(
      `/search/suggestions?${params.toString()}`,
      { timeoutMs: 55000 }
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
  const data = await apiFetch<{ roadAlerts: RoadAlert[] }>('/trip/road-alerts', {
    method: 'POST',
    body: JSON.stringify({ routePoints: sampleRoutePointsForApi(routePoints) }),
    timeoutMs: 55000,
  });
  return data.roadAlerts ?? [];
}

export async function fetchRoadAlertsNear(lat: number, lon: number, radiusM = 3500): Promise<RoadAlert[]> {
  const data = await apiFetch<{ roadAlerts: RoadAlert[] }>('/trip/road-alerts-near', {
    method: 'POST',
    body: JSON.stringify({ lat, lon, radiusM }),
    timeoutMs: 15000,
  });
  return data.roadAlerts ?? [];
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
  try {
    return await apiFetch<TripPlan>('/trip/plan', {
      method: 'POST',
      body: JSON.stringify(params),
      timeoutMs: PLAN_TRIP_TIMEOUT_MS,
      retries: 1,
    });
  } catch (err) {
    const raw = err instanceof Error ? err : new Error(String(err));
    const canFallback =
      isNetworkFetchError(err) ||
      /demorou demais|servidor|conectar|fetch failed|failed to fetch|Erro na API \(5/i.test(raw.message);

    if (!canFallback) throw raw;

    try {
      const { planTripDirect } = await import('./lib/tripPlanDirect');
      return await planTripDirect(params);
    } catch (directErr) {
      throw directErr instanceof Error ? directErr : new Error(String(directErr));
    }
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

export function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocalização não suportada'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 10000,
    });
  });
}

export function watchPosition(
  onUpdate: (pos: GeolocationPosition) => void,
  onError?: (err: GeolocationPositionError) => void
): number {
  return navigator.geolocation.watchPosition(onUpdate, onError, {
    enableHighAccuracy: true,
    timeout: 15000,
    maximumAge: 3000,
  });
}
