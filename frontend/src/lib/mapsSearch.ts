import type { AddressSuggestion } from '../api';
import {
  MIN_QUERY_LEN,
  fetchPhotonFeatures,
  rankSuggestions,
} from './photonSearch';

interface AddressFields {
  freeformAddress?: string;
  municipality?: string;
  municipalitySubdivision?: string;
  countrySubdivision?: string;
  countrySubdivisionCode?: string;
}

function normalizeStateCode(code?: string, subdivision?: string): string {
  if (code?.trim()) {
    return code.trim().toUpperCase().replace(/^BR-/, '');
  }
  const map: Record<string, string> = {
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
  const key = subdivision?.trim().toLowerCase();
  return key ? (map[key] ?? '') : '';
}

function formatLocationTag(address?: AddressFields, placeName?: string): string {
  if (!address) return '';
  const stateCode = normalizeStateCode(address.countrySubdivisionCode, address.countrySubdivision);
  const city = address.municipality?.trim() ?? '';
  const district = address.municipalitySubdivision?.trim() ?? '';
  const name = placeName?.trim() ?? city;

  if (
    district &&
    city &&
    district.toLowerCase() !== city.toLowerCase() &&
    district.toLowerCase() !== name.toLowerCase()
  ) {
    return stateCode ? `${district} — ${city}/${stateCode}` : `${district} — ${city}`;
  }
  if (city && stateCode) return `${city}/${stateCode}`;
  if (name && stateCode) return `${name}/${stateCode}`;
  return address.freeformAddress ?? city ?? name;
}

function parseSuggestion(r: {
  id: string;
  address?: AddressFields;
  position: { lat: number; lon: number };
}): AddressSuggestion {
  const addr = r.address;
  const city = addr?.municipality?.trim() ?? '';
  const district = addr?.municipalitySubdivision?.trim() ?? '';
  const stateCode = normalizeStateCode(addr?.countrySubdivisionCode, addr?.countrySubdivision);

  const placeName = city || district || addr?.freeformAddress?.split(',')[0]?.trim() || 'Destino';
  const locationTag = formatLocationTag(addr, placeName);
  const freeform = addr?.freeformAddress ?? locationTag;

  return {
    id: r.id,
    label: locationTag || placeName,
    placeName,
    city: city || placeName,
    stateCode,
    locationTag,
    address: freeform,
    lat: r.position.lat,
    lon: r.position.lon,
  };
}

function photonStateCode(state?: string): string {
  if (!state?.trim()) return '';
  if (state.trim().length === 2) return state.trim().toUpperCase();
  return normalizeStateCode(undefined, state);
}

function featureToSuggestion(f: {
  geometry: { coordinates: [number, number] };
  properties: Record<string, string | number | undefined>;
}): AddressSuggestion {
  const [lonVal, latVal] = f.geometry.coordinates;
  const props = f.properties;
  const osmType = String(props.type ?? props.osm_value ?? '').toLowerCase();
  const city = String(props.city ?? props.county ?? '').trim();
  const district = String(props.district ?? props.locality ?? '').trim();
  const stateCode = photonStateCode(String(props.state ?? ''));
  const street = String(props.street ?? '').trim();
  const rawName = String(props.name ?? '').trim();

  let placeName = city || rawName || district || 'Destino';
  if (['city', 'town', 'village', 'hamlet', 'municipality'].includes(osmType) && rawName) {
    placeName = rawName;
  }

  const address: AddressFields = {
    freeformAddress: [placeName, street, city, stateCode].filter(Boolean).join(', '),
    municipality: city || placeName,
    municipalitySubdivision: district,
    countrySubdivision: String(props.state ?? ''),
    countrySubdivisionCode: stateCode,
  };

  return parseSuggestion({
    id: String(props.osm_id ?? `${latVal}-${lonVal}`),
    address,
    position: { lat: latVal, lon: lonVal },
  });
}

function dedupeSuggestions(items: AddressSuggestion[]): AddressSuggestion[] {
  const seen = new Set<string>();
  const out: AddressSuggestion[] = [];
  for (const s of items) {
    const key = `${s.lat.toFixed(4)}-${s.lon.toFixed(4)}-${s.locationTag}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

function mergeFeatures(
  primary: Awaited<ReturnType<typeof fetchPhotonFeatures>>,
  extra: Awaited<ReturnType<typeof fetchPhotonFeatures>>
) {
  const seen = new Set(primary.map((f) => String(f.properties.osm_id ?? f.geometry.coordinates.join(','))));
  const merged = [...primary];
  for (const f of extra) {
    const k = String(f.properties.osm_id ?? f.geometry.coordinates.join(','));
    if (!seen.has(k)) {
      seen.add(k);
      merged.push(f);
    }
  }
  return merged;
}

/** Busca direta no Photon (OSM) — cidades e bairros relacionados ao texto digitado. */
export async function searchSuggestionsDirect(
  query: string,
  lat?: number,
  lon?: number
): Promise<AddressSuggestion[]> {
  if (query.trim().length < MIN_QUERY_LEN) return [];

  const opts = { lat, lon, limit: 15 };
  const adminLayers = ['city', 'district', 'locality', 'county'];

  let features = await fetchPhotonFeatures(query, { ...opts, layers: adminLayers });
  if (features.length < 4) {
    const streetFeats = await fetchPhotonFeatures(query, { ...opts, layers: ['street'] });
    features = mergeFeatures(features, streetFeats);
  }

  const suggestions = features.map(featureToSuggestion);
  return rankSuggestions(dedupeSuggestions(suggestions), query, lat, lon).slice(0, 8);
}
