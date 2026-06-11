export interface VehicleProfile {
  id: string;
  name: string;
  autonomyKm: number;
  currentFuelKm: number;
  fuelReserveKm: number;
}

export interface TripPreferences {
  destination: string;
  destinationLat?: number;
  destinationLon?: number;
  stopIntervalMinutes: number;
  categories: PoiCategory[];
}

export type PoiCategory = 'fuel' | 'food' | 'hotel';
export interface RoutePoint {
  lat: number;
  lon: number;
}

export interface RouteLeg {
  summary: {
    lengthInMeters: number;
    travelTimeInSeconds: number;
  };
  points: RoutePoint[];
}

export interface RouteResponse {
  legs: RouteLeg[];
  totalDistanceKm: number;
  totalDurationMinutes: number;
  boundingBox?: {
    northEast: RoutePoint;
    southWest: RoutePoint;
  };
}

export interface PoiResult {
  id: string;
  name: string;
  category: PoiCategory;
  lat: number;
  lon: number;
  address?: string;
  distanceFromRouteKm?: number;
  distanceFromCurrentKm?: number;
}

export interface FuelAlert {
  remainingKm: number;
  status: 'ok' | 'warning' | 'critical';
  message: string;
  nearestStation?: PoiResult;
  lastSafeStation?: PoiResult;
}

export interface StopAlert {
  type: 'rest' | 'fuel' | 'scheduled';
  message: string;
  minutesUntil?: number;
  kmUntil?: number;
}

export interface TripPlan {
  route: RouteResponse;
  pois: PoiResult[];
  fuelAlert: FuelAlert;
  scheduledStops: StopAlert[];
}
