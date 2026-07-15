/** Compartilhar / abrir destino via query string. */

import { parseLocationLink } from './parseLocationLink';

export function buildDestinationShareUrl(place: {
  lat: number;
  lon: number;
  label: string;
}): string {
  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set('d', `${place.lat.toFixed(5)},${place.lon.toFixed(5)}`);
  url.searchParams.set('n', place.label.slice(0, 90));
  return url.toString();
}

export function parseDestinationFromUrl(
  search = window.location.search
): { lat: number; lon: number; label: string } | null {
  // Nosso formato ?d=lat,lon&n=nome
  try {
    const params = new URLSearchParams(search);
    const d = params.get('d');
    if (d) {
      const [latS, lonS] = d.split(',');
      const lat = Number(latS);
      const lon = Number(lonS);
      if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
        return {
          lat,
          lon,
          label: (params.get('n') || 'Destino compartilhado').slice(0, 120),
        };
      }
    }
  } catch {
    /* fall through */
  }

  // URL completa colada na barra / deep link com maps/waze
  try {
    const parsed = parseLocationLink(window.location.href);
    if (parsed) return { lat: parsed.lat, lon: parsed.lon, label: parsed.label };
  } catch {
    /* ignore */
  }

  return null;
}

export function clearDestinationShareParams(): void {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('d') && !url.searchParams.has('n')) return;
    url.searchParams.delete('d');
    url.searchParams.delete('n');
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
  } catch {
    /* ignore */
  }
}

export async function shareDestination(place: {
  lat: number;
  lon: number;
  label: string;
}): Promise<'shared' | 'copied' | 'failed'> {
  const link = buildDestinationShareUrl(place);
  const title = 'Drive Navigator';
  const text = `Navegar até ${place.label}`;
  try {
    if (navigator.share) {
      await navigator.share({ title, text, url: link });
      return 'shared';
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return 'failed';
  }
  try {
    await navigator.clipboard.writeText(link);
    return 'copied';
  } catch {
    return 'failed';
  }
}
