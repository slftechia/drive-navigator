import { useEffect, useRef, useState } from 'react';

const NOMINATIM = 'https://nominatim.openstreetmap.org/reverse';
const MIN_MOVE_KM = 0.04;
const THROTTLE_MS = 12_000;

function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const lat1 = (aLat * Math.PI) / 180;
  const lat2 = (bLat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function pickStreetName(addr: Record<string, string | undefined>): string | null {
  const name =
    addr.road ||
    addr.pedestrian ||
    addr.footway ||
    addr.path ||
    addr.residential ||
    addr.suburb ||
    addr.neighbourhood ||
    addr.hamlet ||
    null;
  return name?.trim() || null;
}

/** Nome da via atual (Nominatim reverse, com throttle). */
export function useCurrentStreet(
  active: boolean,
  lat: number,
  lon: number,
  fallbackStreet?: string | null
): string | null {
  const [street, setStreet] = useState<string | null>(null);
  const lastFetchRef = useRef<{ lat: number; lon: number; at: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!active) return;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

    const now = Date.now();
    const prev = lastFetchRef.current;
    if (
      prev &&
      now - prev.at < THROTTLE_MS &&
      haversineKm(prev.lat, prev.lon, lat, lon) < MIN_MOVE_KM
    ) {
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    lastFetchRef.current = { lat, lon, at: now };

    const url = new URL(NOMINATIM);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lon', String(lon));
    url.searchParams.set('zoom', '18');
    url.searchParams.set('addressdetails', '1');

    void fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'pt-BR',
      },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { address?: Record<string, string> } | null) => {
        if (!data?.address) return;
        const name = pickStreetName(data.address);
        if (name) setStreet(name);
      })
      .catch(() => {
        /* ignore abort / network */
      });

    return () => controller.abort();
  }, [active, lat, lon]);

  return street || fallbackStreet || null;
}
