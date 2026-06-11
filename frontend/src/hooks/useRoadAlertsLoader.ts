import { useEffect, useRef } from 'react';
import { fetchRoadAlerts } from '../api';
import { filterAlertsOnRoute, mergeRoadAlerts } from '../lib/roadAlerts';
import { routeProgressKm, sliceRouteWindow } from '../utils/geo';
import type { TripPlan } from '../api';

interface UseRoadAlertsLoaderOptions {
  active: boolean;
  position: { lat: number; lon: number };
  routePoints: Array<{ lat: number; lon: number }> | undefined;
  navigationStartToken: number;
  onAlerts: (updater: (prev: TripPlan | null) => TripPlan | null) => void;
}

export function useRoadAlertsLoader({
  active,
  position,
  routePoints,
  navigationStartToken,
  onAlerts,
}: UseRoadAlertsLoaderOptions): void {
  const lastFetchKmRef = useRef(-999);
  const lastNavTokenRef = useRef(-1);
  const positionRef = useRef(position);
  const routePointsRef = useRef(routePoints);
  positionRef.current = position;
  routePointsRef.current = routePoints;

  const onAlertsRef = useRef(onAlerts);
  onAlertsRef.current = onAlerts;

  const mergeOnRoute = (incoming: Awaited<ReturnType<typeof fetchRoadAlerts>>) => {
    const pts = routePointsRef.current;
    if (!incoming.length || !pts?.length) return;
    const onRoute = filterAlertsOnRoute(incoming, pts, 0.18);
    if (!onRoute.length) return;
    onAlertsRef.current((prev) => {
      if (!prev) return prev;
      return { ...prev, roadAlerts: mergeRoadAlerts(prev.roadAlerts, onRoute) };
    });
  };

  const fetchWindow = () => {
    const pts = routePointsRef.current;
    if (!pts?.length) return;
    const { lat, lon } = positionRef.current;
    const windowPts = sliceRouteWindow(pts, lat, lon, 25, 55);
    void fetchRoadAlerts(windowPts).then(mergeOnRoute);
  };

  useEffect(() => {
    if (!active || !routePoints?.length) return;

    const tokenChanged = navigationStartToken !== lastNavTokenRef.current;
    if (tokenChanged) {
      lastNavTokenRef.current = navigationStartToken;
      lastFetchKmRef.current = -999;
      onAlertsRef.current((prev) => (prev ? { ...prev, roadAlerts: [] } : prev));
    }

    fetchWindow();
    lastFetchKmRef.current = routeProgressKm(positionRef.current, routePoints);
  }, [active, navigationStartToken, routePoints]);

  useEffect(() => {
    if (!active || !routePoints?.length) return;

    const tick = () => {
      const pts = routePointsRef.current;
      if (!pts?.length) return;
      const { lat, lon } = positionRef.current;
      const progressKm = routeProgressKm({ lat, lon }, pts);
      if (Math.abs(progressKm - lastFetchKmRef.current) < 5) return;
      lastFetchKmRef.current = progressKm;
      fetchWindow();
    };

    const id = window.setInterval(tick, 15_000);
    return () => window.clearInterval(id);
  }, [active, routePoints, navigationStartToken]);
}
