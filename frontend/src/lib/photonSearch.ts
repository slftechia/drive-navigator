import type { AddressSuggestion } from '../api';
import { haversineKm } from '../utils/geo';

export const PHOTON_BASE = 'https://photon.komoot.io';
export const PHOTON_BR_BBOX = '-73.99,-33.75,-34.79,5.27';
export const MIN_QUERY_LEN = 2;

export type SearchResultKind = 'poi' | 'street' | 'address' | 'admin';

const ADMIN_PLACE_TYPES = new Set([
  'city',
  'town',
  'village',
  'hamlet',
  'municipality',
  'locality',
  'district',
  'suburb',
  'neighbourhood',
  'neighborhood',
  'county',
  'state',
]);

const POI_OSM_KEYS = new Set(['amenity', 'shop', 'tourism', 'leisure', 'office', 'craft']);

export function normalizeForMatch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Palavras genéricas de categoria (não exigem match no nome cadastrado). */
const GENERIC_CATEGORY_WORDS = new Set([
  'materiais',
  'material',
  'construcao',
  'construção',
  'comercio',
  'comércio',
  'loja',
  'lojas',
  'oficina',
  'mecanica',
  'mecânica',
  'escola',
  'colegio',
  'colégio',
  'posto',
  'gasolina',
  'restaurante',
  'lanchonete',
  'farmacia',
  'farmácia',
  'mercado',
  'supermercado',
  'hotel',
  'pousada',
  'hospital',
  'clinica',
  'clínica',
  'banco',
  'igreja',
  'padaria',
  'bar',
  'cafe',
  'café',
  'shopping',
  'atacado',
  'varejo',
  'auto',
  'pecas',
  'peças',
  'servicos',
  'serviços',
  'center',
  'centro',
]);

export function queryTokens(rawQuery: string): string[] {
  const stop = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'na', 'no', 'a', 'o', 'ao', 'as', 'os']);
  return normalizeForMatch(rawQuery)
    .split(/[\s,./+-]+/)
    .filter((t) => t.length >= 2 && !stop.has(t));
}

/** Tokens de marca/nome (ignora categoria genérica). */
export function brandTokens(rawQuery: string): string[] {
  return queryTokens(rawQuery).filter((t) => !GENERIC_CATEGORY_WORDS.has(t));
}

export function textMatchesAllTokens(haystack: string, tokens: string[]): boolean {
  if (tokens.length === 0) return false;
  const h = normalizeForMatch(haystack);
  return tokens.every((t) => h.includes(t));
}

export function isGenericCategoryWord(token: string): boolean {
  return GENERIC_CATEGORY_WORDS.has(normalizeForMatch(token));
}

export function inferResultKind(props: Record<string, string | number | undefined>): SearchResultKind {
  const type = normalizeForMatch(String(props.type ?? props.osm_value ?? ''));
  const osmKey = normalizeForMatch(String(props.osm_key ?? ''));
  if (ADMIN_PLACE_TYPES.has(type)) return 'admin';
  if (type === 'street' || osmKey === 'highway') return 'street';
  if (type === 'house' || type === 'housenumber') return 'address';
  if (POI_OSM_KEYS.has(osmKey)) return 'poi';
  if (String(props.name ?? '').trim()) return 'poi';
  return 'address';
}

/** Aceita resultado se o texto bate de forma razoável (não exige perímetro). */
export function isRelevantPhotonMatch(
  props: Record<string, string | number | undefined>,
  rawQuery: string
): boolean {
  const q = normalizeForMatch(rawQuery);
  if (q.length < MIN_QUERY_LEN) return false;

  const tokens = queryTokens(rawQuery);
  const type = normalizeForMatch(String(props.type ?? props.osm_value ?? ''));
  const osmKey = normalizeForMatch(String(props.osm_key ?? ''));
  const name = String(props.name ?? '').trim();
  const city = String(props.city ?? '').trim();
  const district = String(props.district ?? props.locality ?? '').trim();
  const county = String(props.county ?? '').trim();
  const street = String(props.street ?? '').trim();
  const state = String(props.state ?? '').trim();
  const hay = [name, city, district, county, street, state].filter(Boolean).join(' ');
  const hayN = normalizeForMatch(hay);

  if (tokens.length >= 2 && textMatchesAllTokens(hay, tokens)) return true;

  if (name && (normalizeForMatch(name).startsWith(q) || normalizeForMatch(name).includes(q))) return true;
  if (city && (normalizeForMatch(city).startsWith(q) || normalizeForMatch(city).includes(q))) return true;
  if (county && normalizeForMatch(county).startsWith(q)) return true;
  if (district && normalizeForMatch(district).startsWith(q)) return true;

  if ((type === 'street' || osmKey === 'highway') && street) {
    const sn = normalizeForMatch(street);
    if (sn.startsWith(q) || sn.includes(q) || textMatchesAllTokens(street, tokens)) return true;
  }

  if (hayN.includes(q)) return true;
  return false;
}

export function suggestionMatchesQuery(s: AddressSuggestion, rawQuery: string): boolean {
  const tokens = queryTokens(rawQuery);
  if (tokens.length === 0) {
    const q = normalizeForMatch(rawQuery);
    if (q.length < MIN_QUERY_LEN) return false;
    const hay = normalizeForMatch([s.placeName, s.label, s.locationTag, s.address, s.city].join(' '));
    return hay.includes(q);
  }

  const hay = [s.placeName, s.label, s.locationTag, s.address, s.city, s.stateCode].filter(Boolean).join(' ');
  const hayN = normalizeForMatch(hay);
  const name = normalizeForMatch(s.placeName);
  const city = normalizeForMatch(s.city);
  const label = normalizeForMatch(s.label);
  const q = normalizeForMatch(rawQuery);

  if (textMatchesAllTokens(hay, tokens)) return true;
  if (name.includes(q) || city.includes(q) || label.includes(q)) return true;

  // "Quevedo materiais" → aceita se o nome tem "Quevedo" (categoria genérica opcional)
  const brands = brandTokens(rawQuery);
  if (brands.length > 0 && textMatchesAllTokens(hay, brands)) return true;
  if (brands.length === 1 && (name.includes(brands[0]) || hayN.includes(brands[0]))) return true;

  if (tokens.length === 1 && (name.startsWith(tokens[0]) || name.includes(tokens[0]))) return true;
  return false;
}

/**
 * Ranking estilo Google Maps / Waze:
 * - cidades/estados sempre entram (mesmo longe)
 * - POIs/ruas ganham por proximidade
 * - match de nome exato sobe forte
 */
export function rankSuggestions(
  results: AddressSuggestion[],
  query: string,
  lat?: number,
  lon?: number
): AddressSuggestion[] {
  const q = normalizeForMatch(query);
  const tokens = queryTokens(query);
  const hasGps = lat != null && lon != null && Number.isFinite(lat) && Number.isFinite(lon);

  const filtered = results.filter((s) => suggestionMatchesQuery(s, query));
  if (filtered.length === 0) return [];

  const score = (s: AddressSuggestion) => {
    let pts = 0;
    const name = normalizeForMatch(s.placeName);
    const city = normalizeForMatch(s.city);
    const tag = normalizeForMatch(s.locationTag);
    const kind = s.resultKind ?? 'address';
    const distKm = hasGps ? haversineKm(lat!, lon!, s.lat, s.lon) : 0;

    // Match de texto
    if (name === q || city === q || tag === q) pts += 5000;
    else if (name.startsWith(q) || city.startsWith(q)) pts += 3200;
    else if (name.includes(q) || city.includes(q)) pts += 1800;
    else if (tokens.length >= 2 && textMatchesAllTokens([name, city, tag, s.address].join(' '), tokens)) {
      pts += 2400;
    }

    // Tipo
    if (kind === 'admin') {
      // Cidades: proximidade ajuda, mas NÃO elimina distantes
      pts += 900;
      if (hasGps) {
        if (distKm <= 40) pts += 600;
        else if (distKm <= 200) pts += 200;
        // Distante: só leve soft-penalty (ainda deve aparecer "Rio Verde GO" de SC)
        else pts -= Math.min(800, distKm * 0.15);
      }
    } else if (kind === 'poi') {
      pts += 700;
      if (hasGps) pts -= Math.min(4500, distKm * 45);
      if (hasGps && distKm > 80) pts -= 2500;
    } else if (kind === 'street' || kind === 'address') {
      pts += 500;
      if (hasGps) pts -= Math.min(4500, distKm * 50);
      if (hasGps && distKm > 60) pts -= 3000;
    }

    if (hasGps && distKm <= 3) pts += 400;
    else if (hasGps && distKm <= 15) pts += 180;

    return pts;
  };

  return [...filtered].sort((a, b) => score(b) - score(a)).slice(0, 12);
}

export type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: Record<string, string | number | undefined>;
};

export async function fetchPhotonFeatures(
  query: string,
  options?: {
    lat?: number;
    lon?: number;
    limit?: number;
    layers?: string[];
    /** Se true, não aplica bbox do Brasil (ainda raramente útil). Default: Brasil. */
    brazilOnly?: boolean;
  }
): Promise<PhotonFeature[]> {
  const url = new URL(`${PHOTON_BASE}/api/`);
  url.searchParams.set('q', query.trim());
  url.searchParams.set('limit', String(options?.limit ?? 15));
  if (options?.brazilOnly !== false) {
    url.searchParams.set('bbox', PHOTON_BR_BBOX);
  }
  if (options?.layers?.length) {
    for (const layer of options.layers) {
      url.searchParams.append('layer', layer);
    }
  }
  // Bias geográfico (Photon usa como preferência, não como filtro duro)
  if (options?.lat !== undefined && options?.lon !== undefined) {
    url.searchParams.set('lat', String(options.lat));
    url.searchParams.set('lon', String(options.lon));
  }

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 6_000);
  try {
    const res = await fetch(url.toString(), { signal: controller.signal });
    if (!res.ok) throw new Error(`Photon search ${res.status}`);
    const data = (await res.json()) as { features?: PhotonFeature[] };
    return (data.features ?? []).filter((f) => {
      const cc = String(f.properties.countrycode ?? f.properties.country ?? '').toUpperCase();
      return (!cc || cc === 'BR') && isRelevantPhotonMatch(f.properties, query);
    });
  } finally {
    window.clearTimeout(timer);
  }
}
