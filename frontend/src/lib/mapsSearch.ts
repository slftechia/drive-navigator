import type { AddressSuggestion } from '../api';
import {
  MIN_QUERY_LEN,
  brandTokens,
  fetchPhotonFeatures,
  inferResultKind,
  rankSuggestions,
  suggestionMatchesQuery,
  type PhotonFeature,
  type SearchResultKind,
} from './photonSearch';
import { fetchLocalPlacesByName } from './localPlacesSearch';
import { hasGooglePlaces, searchGooglePlaces } from './googlePlacesSearch';

const STATE_MAP: Record<string, string> = {
  acre: 'AC',
  alagoas: 'AL',
  amapá: 'AP',
  amapa: 'AP',
  amazonas: 'AM',
  bahia: 'BA',
  ceará: 'CE',
  ceara: 'CE',
  'distrito federal': 'DF',
  'espírito santo': 'ES',
  'espirito santo': 'ES',
  goiás: 'GO',
  goias: 'GO',
  maranhão: 'MA',
  maranhao: 'MA',
  'mato grosso': 'MT',
  'mato grosso do sul': 'MS',
  'minas gerais': 'MG',
  pará: 'PA',
  para: 'PA',
  paraíba: 'PB',
  paraiba: 'PB',
  paraná: 'PR',
  parana: 'PR',
  pernambuco: 'PE',
  piauí: 'PI',
  piaui: 'PI',
  'rio de janeiro': 'RJ',
  'rio grande do norte': 'RN',
  'rio grande do sul': 'RS',
  rondônia: 'RO',
  rondonia: 'RO',
  roraima: 'RR',
  'santa catarina': 'SC',
  'são paulo': 'SP',
  'sao paulo': 'SP',
  sergipe: 'SE',
  tocantins: 'TO',
};

function normalizeStateCode(code?: string, subdivision?: string): string {
  if (code?.trim()) {
    return code.trim().toUpperCase().replace(/^BR-/, '');
  }
  const key = subdivision?.trim().toLowerCase();
  return key ? (STATE_MAP[key] ?? '') : '';
}

function photonStateCode(state?: string): string {
  if (!state?.trim()) return '';
  if (state.trim().length === 2) return state.trim().toUpperCase();
  return normalizeStateCode(undefined, state);
}

function featureToSuggestion(f: PhotonFeature): AddressSuggestion {
  const [lonVal, latVal] = f.geometry.coordinates;
  const props = f.properties;
  const city = String(props.city ?? props.county ?? '').trim();
  const district = String(props.district ?? props.locality ?? '').trim();
  const stateCode = photonStateCode(String(props.state ?? ''));
  const street = String(props.street ?? '').trim();
  const rawName = String(props.name ?? '').trim();
  const resultKind = inferResultKind(props);

  let placeName = rawName || city || district || street || 'Destino';
  let locationTag = placeName;
  let address = '';
  let label = placeName;

  if (resultKind === 'admin') {
    placeName = rawName || city;
    locationTag = [placeName, stateCode].filter(Boolean).join('/');
    label = locationTag;
    address = [district && district !== placeName ? district : '', city && city !== placeName ? city : '', stateCode]
      .filter(Boolean)
      .join(', ');
  } else if (resultKind === 'street') {
    placeName = street || rawName;
    locationTag = placeName;
    label = placeName;
    address = [district, city, stateCode].filter(Boolean).join(', ');
  } else if (resultKind === 'poi') {
    placeName = rawName || placeName;
    locationTag = placeName;
    label = stateCode || city ? `${placeName} — ${[city, stateCode].filter(Boolean).join('/')}` : placeName;
    address = [street || district, city, stateCode].filter(Boolean).join(', ');
  } else {
    address = [street, district, city, stateCode].filter(Boolean).join(', ');
    label = placeName;
  }

  return {
    id: String(props.osm_id ?? `${latVal}-${lonVal}`),
    label,
    placeName,
    city: city || placeName,
    stateCode,
    locationTag,
    address: address || label,
    lat: latVal,
    lon: lonVal,
    resultKind,
  };
}

function dedupeSuggestions(items: AddressSuggestion[]): AddressSuggestion[] {
  const seen = new Set<string>();
  const out: AddressSuggestion[] = [];
  for (const s of items) {
    const key = `${s.lat.toFixed(4)}-${s.lon.toFixed(4)}-${s.placeName.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

function mergeFeatures(lists: PhotonFeature[][]): PhotonFeature[] {
  const seen = new Set<string>();
  const merged: PhotonFeature[] = [];
  for (const list of lists) {
    for (const f of list) {
      const k = String(f.properties.osm_id ?? f.geometry.coordinates.join(','));
      if (seen.has(k)) continue;
      seen.add(k);
      merged.push(f);
    }
  }
  return merged;
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise.catch(() => fallback),
    new Promise<T>((resolve) => window.setTimeout(() => resolve(fallback), ms)),
  ]);
}

/** Nominatim Brasil — fallback forte para cidades (ex.: Rio Verde GO). */
async function fetchNominatimSuggestions(
  query: string,
  lat?: number,
  lon?: number
): Promise<AddressSuggestion[]> {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query.trim());
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '10');
  url.searchParams.set('countrycodes', 'br');
  url.searchParams.set('addressdetails', '1');
  if (lat != null && lon != null) {
    url.searchParams.set('viewbox', `${lon - 4},${lat + 4},${lon + 4},${lat - 4}`);
    // bounded=0 → bias, não filtro duro
  }

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 5_500);
  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return [];

    const data = (await res.json()) as Array<{
      place_id: number;
      lat: string;
      lon: string;
      display_name: string;
      type?: string;
      class?: string;
      name?: string;
      address?: {
        road?: string;
        suburb?: string;
        neighbourhood?: string;
        city?: string;
        town?: string;
        village?: string;
        municipality?: string;
        state?: string;
      };
    }>;

    return data
      .map((row) => {
        const addr = row.address ?? {};
        const city = addr.city ?? addr.town ?? addr.village ?? addr.municipality ?? '';
        const district = addr.suburb ?? addr.neighbourhood ?? '';
        const stateCode = normalizeStateCode(undefined, addr.state);
        const road = addr.road ?? '';
        const rawName = row.name?.trim() || road || row.display_name.split(',')[0]?.trim() || 'Destino';
        const osmClass = String(row.class ?? '').toLowerCase();
        const osmType = String(row.type ?? '').toLowerCase();

        let resultKind: SearchResultKind = 'address';
        if (osmClass === 'place' && ['city', 'town', 'village', 'municipality', 'hamlet'].includes(osmType)) {
          resultKind = 'admin';
        } else if (osmClass === 'highway') {
          resultKind = 'street';
        } else if (['amenity', 'shop', 'tourism', 'leisure', 'building'].includes(osmClass)) {
          resultKind = 'poi';
        }

        const placeName = resultKind === 'street' ? road || rawName : rawName;
        const locationTag =
          resultKind === 'admin'
            ? [placeName || city, stateCode].filter(Boolean).join('/')
            : placeName;
        const address = [district, city, stateCode].filter(Boolean).join(', ') || row.display_name;

        return {
          id: `nom-${row.place_id}`,
          label: locationTag,
          placeName: placeName || city,
          city: city || placeName,
          stateCode,
          locationTag,
          address,
          lat: Number(row.lat),
          lon: Number(row.lon),
          resultKind,
        } satisfies AddressSuggestion;
      })
      .filter((s) => suggestionMatchesQuery(s, query));
  } catch {
    return [];
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * Busca estilo Google Maps / Waze:
 * 0) Google Places (se houver chave) — qualidade Maps
 * 1) Photon Brasil inteiro + query
 * 2) Nominatim
 * 3) Overpass local + retry pela marca (ex.: "Quevedo" de "Quevedo materiais")
 */
export async function searchSuggestionsDirect(
  query: string,
  lat?: number,
  lon?: number,
  onPartial?: (results: AddressSuggestion[]) => void
): Promise<AddressSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < MIN_QUERY_LEN) return [];

  const hasGps = lat != null && lon != null && Number.isFinite(lat) && Number.isFinite(lon);
  const bias = hasGps ? { lat: lat!, lon: lon! } : {};
  const brands = brandTokens(trimmed);
  const brandQuery = brands.join(' ').trim();

  const publish = (items: AddressSuggestion[]) => {
    const ranked = rankSuggestions(dedupeSuggestions(items), trimmed, lat, lon);
    if (ranked.length > 0) onPartial?.(ranked);
    return ranked;
  };

  // Google Places só se houver chave (opcional). Caminho padrão = gratuito OSM.
  let googleHits: AddressSuggestion[] = [];
  if (hasGooglePlaces()) {
    googleHits = await withTimeout(searchGooglePlaces(trimmed, lat, lon), 6_500, []);
    if (googleHits.length >= 3) return publish(googleHits);
  }

  // Busca marca em paralelo desde o início ("Quevedo" em "Quevedo materiais")
  const photonQueries = Array.from(
    new Set([brandQuery || trimmed, trimmed].filter((q) => q.length >= MIN_QUERY_LEN))
  );

  const overpassQuery = brandQuery || trimmed;
  const photonP = withTimeout(
    Promise.all(
      photonQueries.flatMap((q) => [
        fetchPhotonFeatures(q, { ...bias, limit: 16 }),
        fetchPhotonFeatures(q, { ...bias, limit: 10, layers: ['city', 'locality', 'district'] }),
        fetchPhotonFeatures(q, { ...bias, limit: 10, layers: ['street', 'house'] }),
      ])
    ),
    5_500,
    [] as PhotonFeature[][]
  );

  const nominatimP = withTimeout(
    Promise.all(
      photonQueries.map((q) => fetchNominatimSuggestions(q, lat, lon))
    ).then((lists) => lists.flat()),
    5_500,
    [] as AddressSuggestion[]
  );

  const overpassP =
    hasGps && overpassQuery.length >= MIN_QUERY_LEN
      ? withTimeout(fetchLocalPlacesByName(overpassQuery, lat!, lon!, 45), 6_500, [])
      : Promise.resolve([] as AddressSuggestion[]);

  const [photonBatches, nominatim, overpass] = await Promise.all([photonP, nominatimP, overpassP]);
  const photonSuggestions = mergeFeatures(photonBatches)
    .map(featureToSuggestion)
    .filter(
      (s) =>
        suggestionMatchesQuery(s, trimmed) ||
        (brandQuery ? suggestionMatchesQuery(s, brandQuery) : false)
    );

  let merged = dedupeSuggestions([...googleHits, ...overpass, ...nominatim, ...photonSuggestions]);
  let ranked = publish(merged);

  // Reforço: palavra de marca mais longa sozinha
  if (ranked.length < 3 && brands.length >= 1) {
    const distinctive = [...brands].sort((a, b) => b.length - a.length)[0];
    if (distinctive !== overpassQuery.toLowerCase()) {
      const retry = await withTimeout(
        Promise.all([
          fetchPhotonFeatures(distinctive, { ...bias, limit: 16 }),
          fetchNominatimSuggestions(distinctive, lat, lon),
          hasGps ? fetchLocalPlacesByName(distinctive, lat!, lon!, 50) : Promise.resolve([]),
        ]),
        5_500,
        [[] as PhotonFeature[], [] as AddressSuggestion[], [] as AddressSuggestion[]] as const
      );
      const [feat, nom, ov] = retry;
      const extra = [
        ...nom,
        ...ov,
        ...feat
          .map(featureToSuggestion)
          .filter((s) => suggestionMatchesQuery(s, distinctive) || suggestionMatchesQuery(s, trimmed)),
      ];
      merged = dedupeSuggestions([...extra, ...merged]);
      ranked = publish(merged);
    }
  }

  return ranked;
}
