import type { AddressSuggestion } from '../api';
import { haversineKm } from '../utils/geo';

export const PHOTON_BASE = 'https://photon.komoot.io';
export const PHOTON_BR_BBOX = '-73.99,-33.75,-34.79,5.27';
export const MIN_QUERY_LEN = 3;

/** Tipos OSM relevantes para destino (cidade, bairro, etc.). */
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

function normalizeForMatch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function startsWithQuery(text: string, queryNorm: string): boolean {
  const t = normalizeForMatch(text);
  return t.length > 0 && t.startsWith(queryNorm);
}

export function isRelevantPhotonMatch(
  props: Record<string, string | number | undefined>,
  rawQuery: string
): boolean {
  const q = normalizeForMatch(rawQuery);
  if (q.length < MIN_QUERY_LEN) return false;

  const type = normalizeForMatch(String(props.type ?? props.osm_value ?? ''));
  const name = String(props.name ?? '').trim();
  const city = String(props.city ?? '').trim();
  const district = String(props.district ?? props.locality ?? '').trim();
  const county = String(props.county ?? '').trim();
  const street = String(props.street ?? '').trim();

  // Cidade/município começa com o texto digitado (ex.: "este" → Esteio)
  if (city && startsWithQuery(city, q)) return true;
  if (county && startsWithQuery(county, q)) return true;

  // Lugar administrativo cujo nome é o destino
  if (ADMIN_PLACE_TYPES.has(type) && name && startsWithQuery(name, q)) return true;
  if (ADMIN_PLACE_TYPES.has(type) && district && startsWithQuery(district, q)) return true;

  // Ruas — só se o nome da rua ou da cidade combinar (evita POIs em outras cidades)
  if (type === 'street') {
    const cityMatch = city.length > 0 && startsWithQuery(city, q);
    if (street && startsWithQuery(street, q)) return q.length >= 5 || cityMatch;
    if (name && startsWithQuery(name, q)) return q.length >= 5 || cityMatch;
    return false;
  }

  // Ignora comércios/POIs cujo nome só contém as letras (Estetizar, Estevões, etc.)
  if (!ADMIN_PLACE_TYPES.has(type)) return false;

  return false;
}

export function rankSuggestions(
  results: AddressSuggestion[],
  query: string,
  lat?: number,
  lon?: number
): AddressSuggestion[] {
  const q = normalizeForMatch(query);
  const score = (s: AddressSuggestion) => {
    let pts = 0;
    const city = normalizeForMatch(s.city);
    const name = normalizeForMatch(s.placeName);
    const tag = normalizeForMatch(s.locationTag);

    if (city === q || name === q) pts += 2000;
    else if (city.startsWith(q)) pts += 1200;
    else if (name.startsWith(q)) pts += 800;
    else if (tag.startsWith(q)) pts += 400;

    if (lat != null && lon != null && Number.isFinite(lat) && Number.isFinite(lon)) {
      pts -= haversineKm(lat, lon, s.lat, s.lon) * 4;
    }
    return pts;
  };
  return [...results].sort((a, b) => score(b) - score(a));
}

type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: Record<string, string | number | undefined>;
};

export async function fetchPhotonFeatures(
  query: string,
  options?: { lat?: number; lon?: number; limit?: number; layers?: string[] }
): Promise<PhotonFeature[]> {
  const url = new URL(`${PHOTON_BASE}/api/`);
  url.searchParams.set('q', query.trim());
  url.searchParams.set('limit', String(options?.limit ?? 15));
  url.searchParams.set('bbox', PHOTON_BR_BBOX);
  if (options?.layers?.length) {
    for (const layer of options.layers) {
      url.searchParams.append('layer', layer);
    }
  }
  if (options?.lat !== undefined && options?.lon !== undefined) {
    url.searchParams.set('lat', String(options.lat));
    url.searchParams.set('lon', String(options.lon));
  }

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Photon search ${res.status}`);

  const data = (await res.json()) as { features?: PhotonFeature[] };
  return (data.features ?? []).filter((f) => {
    const cc = String(f.properties.countrycode ?? f.properties.country ?? '').toUpperCase();
    return (!cc || cc === 'BR') && isRelevantPhotonMatch(f.properties, query);
  });
}
