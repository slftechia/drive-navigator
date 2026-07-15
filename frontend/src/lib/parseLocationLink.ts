/** Extrai destino de links de localização (Google Maps, Waze, geo:, nosso app). */

export interface ParsedLocationLink {
  lat: number;
  lon: number;
  label: string;
  source: 'drive' | 'google' | 'waze' | 'geo' | 'apple' | 'coords';
}

function cleanLabel(raw: string | null | undefined, fallback: string): string {
  const t = (raw ?? '').trim().replace(/\+/g, ' ');
  if (!t) return fallback;
  try {
    return decodeURIComponent(t).slice(0, 120);
  } catch {
    return t.slice(0, 120);
  }
}

function validCoords(lat: number, lon: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

/** "lat,lon" ou "-27.5, -48.5" */
function parseLatLonPair(raw: string): { lat: number; lon: number } | null {
  const m = raw.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  return validCoords(lat, lon) ? { lat, lon } : null;
}

function fromDriveParams(params: URLSearchParams): ParsedLocationLink | null {
  const d = params.get('d');
  if (!d) return null;
  const pair = parseLatLonPair(d);
  if (!pair) return null;
  return {
    ...pair,
    label: cleanLabel(params.get('n'), 'Destino compartilhado'),
    source: 'drive',
  };
}

function fromGeoUri(text: string): ParsedLocationLink | null {
  // geo:lat,lon or geo:0,0?q=lat,lon(name) or geo:lat,lon?q=Name
  const m = text.trim().match(/^geo:([^?;]+)(?:[?;](.*))?$/i);
  if (!m) return null;
  const head = m[1].trim();
  const query = m[2] ?? '';
  let pair = parseLatLonPair(head);
  let label = 'Destino';

  const qMatch = query.match(/(?:^|&)q=([^&]+)/i);
  if (qMatch) {
    const q = cleanLabel(qMatch[1], '');
    const qPair = parseLatLonPair(q.split('(')[0] ?? '');
    if (qPair) pair = qPair;
    const nameInParens = q.match(/\((.+)\)/);
    if (nameInParens) label = nameInParens[1];
    else if (!qPair && q) label = q;
  }

  if (!pair) return null;
  return { ...pair, label, source: 'geo' };
}

function fromGoogleMaps(url: URL): ParsedLocationLink | null {
  const host = url.hostname.replace(/^www\./, '');
  if (
    !host.includes('google.') &&
    host !== 'maps.app.goo.gl' &&
    host !== 'goo.gl'
  ) {
    return null;
  }
  if (!url.pathname.includes('/maps') && host !== 'maps.app.goo.gl' && host !== 'maps.google.com') {
    // maps.google.com/?q=
    if (host !== 'maps.google.com') return null;
  }

  // /@lat,lon,zoom
  const at = url.pathname.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (at) {
    const lat = Number(at[1]);
    const lon = Number(at[2]);
    if (validCoords(lat, lon)) {
      const place = url.pathname.match(/\/place\/([^/]+)/);
      return {
        lat,
        lon,
        label: cleanLabel(place?.[1]?.replace(/\+/g, ' '), 'Local no Google Maps'),
        source: 'google',
      };
    }
  }

  // !3dLAT!4dLON (data param em place URLs)
  const bang = url.href.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (bang) {
    const lat = Number(bang[1]);
    const lon = Number(bang[2]);
    if (validCoords(lat, lon)) {
      const place = url.pathname.match(/\/place\/([^/]+)/);
      return {
        lat,
        lon,
        label: cleanLabel(place?.[1]?.replace(/\+/g, ' '), 'Local no Google Maps'),
        source: 'google',
      };
    }
  }

  const q = url.searchParams.get('q') || url.searchParams.get('query');
  if (q) {
    const pair = parseLatLonPair(q);
    if (pair) {
      return { ...pair, label: 'Local no Google Maps', source: 'google' };
    }
    // q=Name@lat,lon
    const named = q.match(/^(.+?)@(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
    if (named) {
      const lat = Number(named[2]);
      const lon = Number(named[3]);
      if (validCoords(lat, lon)) {
        return { lat, lon, label: cleanLabel(named[1], 'Local no Google Maps'), source: 'google' };
      }
    }
  }

  const ll = url.searchParams.get('ll');
  if (ll) {
    const pair = parseLatLonPair(ll);
    if (pair) return { ...pair, label: 'Local no Google Maps', source: 'google' };
  }

  // Short links (goo.gl) — sem expandir redirect, não temos coords no texto
  return null;
}

function fromWaze(url: URL): ParsedLocationLink | null {
  const host = url.hostname.replace(/^www\./, '');
  if (host !== 'waze.com' && host !== 'ul.waze.com') return null;

  const ll = url.searchParams.get('ll') || url.searchParams.get('latlng');
  if (ll) {
    const pair = parseLatLonPair(ll);
    if (pair) {
      return {
        ...pair,
        label: cleanLabel(url.searchParams.get('q') || url.searchParams.get('navigate'), 'Local no Waze'),
        source: 'waze',
      };
    }
  }

  const lat = Number(url.searchParams.get('lat'));
  const lon = Number(url.searchParams.get('lon') || url.searchParams.get('lng'));
  if (validCoords(lat, lon)) {
    return {
      lat,
      lon,
      label: cleanLabel(url.searchParams.get('q'), 'Local no Waze'),
      source: 'waze',
    };
  }
  return null;
}

function fromAppleMaps(url: URL): ParsedLocationLink | null {
  if (!url.hostname.includes('maps.apple.com')) return null;
  const ll = url.searchParams.get('ll');
  if (ll) {
    const pair = parseLatLonPair(ll);
    if (pair) {
      return {
        ...pair,
        label: cleanLabel(url.searchParams.get('q'), 'Local no Apple Maps'),
        source: 'apple',
      };
    }
  }
  const address = url.searchParams.get('address') || url.searchParams.get('q');
  // sem coords → deixa busca textual resolver
  if (address && !ll) return null;
  return null;
}

/**
 * Tenta interpretar texto colado / URL aberta.
 * Links curtos (maps.app.goo.gl) sem lat/lon embutido retornam null.
 */
export function parseLocationLink(input: string): ParsedLocationLink | null {
  const text = input.trim();
  if (!text) return null;

  // Nosso app: querystring sozinha ou URL completa
  if (text.startsWith('?') || text.includes('drive-navigator') || text.includes('web.app')) {
    try {
      const url = text.startsWith('?')
        ? new URL(text, 'https://drive-navigator.local/')
        : new URL(text);
      const drive = fromDriveParams(url.searchParams);
      if (drive) return drive;
    } catch {
      /* fall through */
    }
  }

  if (/^geo:/i.test(text)) return fromGeoUri(text);

  // Só coordenadas
  const bare = parseLatLonPair(text);
  if (bare) return { ...bare, label: 'Localização', source: 'coords' };

  // URL http(s)
  if (/^https?:\/\//i.test(text) || text.includes('google.') || text.includes('waze.com')) {
    try {
      const withProto = /^https?:\/\//i.test(text) ? text : `https://${text}`;
      const url = new URL(withProto);
      return fromGoogleMaps(url) || fromWaze(url) || fromAppleMaps(url);
    } catch {
      return null;
    }
  }

  return null;
}

export function looksLikeLocationLink(input: string): boolean {
  const t = input.trim().toLowerCase();
  if (!t) return false;
  if (t.startsWith('geo:')) return true;
  if (/^-?\d+\.\d+\s*,\s*-?\d+\.\d+$/.test(t)) return true;
  if (t.includes('google.') && t.includes('maps')) return true;
  if (t.includes('maps.app.goo.gl') || t.includes('goo.gl/maps')) return true;
  if (t.includes('waze.com')) return true;
  if (t.includes('maps.apple.com')) return true;
  if (t.includes('?d=') && t.includes(',')) return true;
  return false;
}
