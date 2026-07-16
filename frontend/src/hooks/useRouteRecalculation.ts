import { useEffect, useRef, useCallback, useState } from 'react';
import { planTrip, fetchRoadAlerts, type TripPlan, type VehicleConfig } from '../api';
import { mergeRoadAlerts, snapAlertsToRoute } from '../lib/roadAlerts';
import { distanceToRouteKm, haversineKm, sliceRouteWindow } from '../utils/geo';

const OFF_ROUTE_KM = 0.12;
const OFF_ROUTE_CONFIRM_MS = 1600;
const RECALC_COOLDOWN_MS = 7000;
const RECALC_WATCHDOG_MS = 16_000;

interface UseRouteRecalculationOptions {
  active: boolean;
  position: { lat: number; lon: number };
  trip: TripPlan | null;
  routePoints: Array<{ lat: number; lon: number }> | undefined;
  vehicle: VehicleConfig;
  distanceTraveled: number;
  onTripUpdate: (trip: TripPlan) => void;
  onNavigationRefresh: () => void;
  onError: (message: string) => void;
}

export function useRouteRecalculation({
  active,
  position,
  trip,
  routePoints,
  vehicle,
  distanceTraveled,
  onTripUpdate,
  onNavigationRefresh,
  onError,
}: UseRouteRecalculationOptions): boolean {
  const [recalculating, setRecalculating] = useState(false);
  const offRouteSinceRef = useRef<number | null>(null);
  const lastRecalcMsRef = useRef(0);
  const inFlightRef = useRef(false);
  const tripRef = useRef(trip);
  tripRef.current = trip;

  const recalculate = useCallback(async () => {
    const currentTrip = tripRef.current;
    if (!currentTrip || inFlightRef.current) return;
    if (Date.now() - lastRecalcMsRef.current < RECALC_COOLDOWN_MS) return;

    const directToDest = haversineKm(
      position.lat,
      position.lon,
      currentTrip.destination.lat,
      currentTrip.destination.lon
    );
    if (directToDest < 0.08) return;

    inFlightRef.current = true;
    setRecalculating(true);
    lastRecalcMsRef.current = Date.now();
    offRouteSinceRef.current = null;

    const watchdog = window.setTimeout(() => {
      if (!inFlightRef.current) return;
      inFlightRef.current = false;
      setRecalculating(false);
      onError('Recálculo demorou demais. Mantendo a rota atual.');
    }, RECALC_WATCHDOG_MS);

    try {
      const remainingFuel = Math.max(0, vehicle.currentFuelKm - distanceTraveled);
      const result = await planTrip({
        originLat: position.lat,
        originLon: position.lon,
        destination: currentTrip.destination.address,
        destinationLat: currentTrip.destination.lat,
        destinationLon: currentTrip.destination.lon,
        destinationLocationTag: currentTrip.destination.locationTag ?? currentTrip.destination.address,
        waypoints: currentTrip.waypoints,
        currentFuelKm: remainingFuel,
        fuelReserveKm: vehicle.fuelReserveKm,
        stopIntervalMinutes: vehicle.stopIntervalMinutes,
      });

      if (result.route.totalDistanceKm > Math.max(directToDest * 2.8, directToDest + 3)) {
        onError('Rota recalculada parece incorreta. Mantendo rota anterior.');
        return;
      }

      onTripUpdate(result);
      onNavigationRefresh();

      const pts = result.route.legs[0]?.points;
      if (pts?.length) {
        const alertPts =
          result.route.totalDistanceKm > 100
            ? sliceRouteWindow(pts, position.lat, position.lon, 20, 70)
            : pts;
        void fetchRoadAlerts(alertPts)
          .then((roadAlerts) => {
            const onRoute = snapAlertsToRoute(roadAlerts, pts, 1.0);
            if (onRoute.length > 0) {
              onTripUpdate({
                ...result,
                roadAlerts: mergeRoadAlerts(result.roadAlerts, onRoute),
              });
            }
          })
          .catch(() => undefined);
      }
    } catch {
      onError('Não foi possível recalcular a rota.');
    } finally {
      window.clearTimeout(watchdog);
      inFlightRef.current = false;
      setRecalculating(false);
    }
  }, [
    position.lat,
    position.lon,
    vehicle,
    distanceTraveled,
    onTripUpdate,
    onNavigationRefresh,
    onError,
  ]);

  useEffect(() => {
    if (!active || !trip || !routePoints || routePoints.length < 2) {
      offRouteSinceRef.current = null;
      return;
    }

    if (inFlightRef.current) return;

    const dist = distanceToRouteKm(position, routePoints);
    if (dist <= OFF_ROUTE_KM) {
      offRouteSinceRef.current = null;
      return;
    }

    if (offRouteSinceRef.current == null) {
      offRouteSinceRef.current = Date.now();
      return;
    }

    if (Date.now() - offRouteSinceRef.current >= OFF_ROUTE_CONFIRM_MS) {
      void recalculate();
    }
  }, [active, position.lat, position.lon, routePoints, trip, recalculate]);

  return recalculating;
}
