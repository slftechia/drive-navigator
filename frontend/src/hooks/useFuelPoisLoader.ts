import { useEffect, useRef } from 'react';
import type { PoiResult, TripPlan } from '../api';
import { fetchFuelPoisAlongRoute } from '../lib/poisDirect';
import { routeProgressKm } from '../utils/geo';

interface UseFuelPoisLoaderOptions {
  active: boolean;
  position: { lat: number; lon: number };
  routePoints: Array<{ lat: number; lon: number }> | undefined;
  navigationStartToken: number;
  onPois: (updater: (prev: TripPlan | null) => TripPlan | null) => void;
}

function mergeFuelPois(existing: PoiResult[] | undefined, incoming: PoiResult[]): PoiResult[] {
  const map = new Map<string, PoiResult>();
  for (const p of existing ?? []) {
    if (p.category === 'fuel') map.set(p.id, p);
  }
  for (const p of incoming) {
    map.set(p.id, p);
  }
  const fuel = Array.from(map.values());
  const other = (existing ?? []).filter((p) => p.category !== 'fuel');
  return [...other, ...fuel];
}

export function useFuelPoisLoader({
  active,
  position,
  routePoints,
  navigationStartToken,
  onPois,
}: UseFuelPoisLoaderOptions): void {
  const lastFetchKmRef = useRef(-999);
  const positionRef = useRef(position);
  const routePointsRef = useRef(routePoints);
  const onPoisRef = useRef(onPois);
  positionRef.current = position;
  routePointsRef.current = routePoints;
  onPoisRef.current = onPois;

  useEffect(() => {
    if (!active || !routePoints?.length) return;

    const fetchWindow = () => {
      const pts = routePointsRef.current;
      if (!pts?.length) return;
      const { lat, lon } = positionRef.current;
      void fetchFuelPoisAlongRoute(pts, lat, lon, 12, 55).then((incoming) => {
        if (!incoming.length) return;
        onPoisRef.current((prev) => {
          if (!prev) return prev;
          return { ...prev, pois: mergeFuelPois(prev.pois, incoming) };
        });
      });
    };

    fetchWindow();
    lastFetchKmRef.current = routeProgressKm(position, routePoints);
  }, [active, navigationStartToken, routePoints]);

  useEffect(() => {
    if (!active || !routePoints?.length) return;

    const tick = () => {
      const pts = routePointsRef.current;
      if (!pts?.length) return;
      const progressKm = routeProgressKm(positionRef.current, pts);
      if (Math.abs(progressKm - lastFetchKmRef.current) < 8) return;
      lastFetchKmRef.current = progressKm;

      const { lat, lon } = positionRef.current;
      void fetchFuelPoisAlongRoute(pts, lat, lon, 12, 55).then((incoming) => {
        if (!incoming.length) return;
        onPoisRef.current((prev) => {
          if (!prev) return prev;
          return { ...prev, pois: mergeFuelPois(prev.pois, incoming) };
        });
      });
    };

    const id = window.setInterval(tick, 20_000);
    return () => window.clearInterval(id);
  }, [active, routePoints, navigationStartToken]);
}
