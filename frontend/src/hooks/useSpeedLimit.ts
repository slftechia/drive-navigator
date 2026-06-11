import { useEffect, useRef, useState } from 'react';
import { fetchSpeedLimit } from '../api';
import { haversineKm } from '../utils/geo';

interface UseSpeedLimitResult {
  speedLimitKmh: number;
  fromOsm: boolean;
}

export function useSpeedLimit(
  active: boolean,
  lat: number,
  lon: number,
  fallbackKmh: number
): UseSpeedLimitResult {
  const [osmLimit, setOsmLimit] = useState<number | null>(null);
  const lastFetchRef = useRef({ lat: 0, lon: 0, ms: 0 });

  useEffect(() => {
    if (!active) {
      setOsmLimit(null);
      return;
    }

    const moved = haversineKm(lastFetchRef.current.lat, lastFetchRef.current.lon, lat, lon);
    const elapsed = Date.now() - lastFetchRef.current.ms;
    if (moved < 0.06 && elapsed < 12_000) return;

    let cancelled = false;
    void fetchSpeedLimit(lat, lon).then((result) => {
      if (cancelled) return;
      lastFetchRef.current = { lat, lon, ms: Date.now() };
      if (result.speedLimitKmh != null) {
        setOsmLimit(result.speedLimitKmh);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [active, lat, lon]);

  return {
    speedLimitKmh: osmLimit ?? fallbackKmh,
    fromOsm: osmLimit != null,
  };
}
