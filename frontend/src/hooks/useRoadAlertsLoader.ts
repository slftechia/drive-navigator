import { useEffect, useRef } from 'react';
import { fetchCommunityReportsAlongRoute, fetchRoadAlerts } from '../api';
import { mergeRoadAlerts, snapAlertsToRoute } from '../lib/roadAlerts';
import { routeProgressKm, sliceRouteWindow } from '../utils/geo';
import type { TripPlan, RoadAlert } from '../api';

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

  const mergeIncoming = (incoming: RoadAlert[]) => {
    if (!incoming.length) return;
    const pts = routePointsRef.current;
    const snapped =
      pts && pts.length >= 2 ? snapAlertsToRoute(incoming, pts, 0.12) : incoming;
    if (!snapped.length) return;
    onAlertsRef.current((prev) => {
      if (!prev) return prev;
      return { ...prev, roadAlerts: mergeRoadAlerts(prev.roadAlerts, snapped) };
    });
  };

  const fetchWindow = () => {
    const pts = routePointsRef.current;
    if (!pts?.length) return;
    const { lat, lon } = positionRef.current;
    const windowPts = sliceRouteWindow(pts, lat, lon, 25, 65);
    void fetchRoadAlerts(windowPts).then(mergeIncoming);
    void fetchCommunityReportsAlongRoute(windowPts).then(mergeIncoming);
  };

  useEffect(() => {
    if (!active || !routePoints?.length) return;

    const tokenChanged = navigationStartToken !== lastNavTokenRef.current;
    if (tokenChanged) {
      lastNavTokenRef.current = navigationStartToken;
      lastFetchKmRef.current = -999;
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
      if (Math.abs(progressKm - lastFetchKmRef.current) < 4) return;
      lastFetchKmRef.current = progressKm;
      fetchWindow();
    };

    const id = window.setInterval(tick, 12_000);
    return () => window.clearInterval(id);
  }, [active, routePoints, navigationStartToken]);
}
