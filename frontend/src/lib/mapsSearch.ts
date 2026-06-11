import type { AddressSuggestion } from '../api';

const PHOTON_BASE = 'https://photon.komoot.io';
const PHOTON_BR_BBOX = '-73.99,-33.75,-34.79,5.27';
const MIN_QUERY_LEN = 3;

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
  poi?: { name: string };
  position: { lat: number; lon: number };
}): AddressSuggestion {
  const addr = r.address;
  const poiName = r.poi?.name?.trim();
  const city = addr?.municipality?.trim() ?? '';
  const district = addr?.municipalitySubdivision?.trim() ?? '';
  const stateCode = normalizeStateCode(addr?.countrySubdivisionCode, addr?.countrySubdivision);

  let placeName = poiName || city || district || addr?.freeformAddress?.split(',')[0]?.trim() || 'Destino';
  if (!poiName && district && city && district.toLowerCase() !== city.toLowerCase()) {
    placeName = district;
  }

  const locationTag = formatLocationTag(addr, placeName);
  const label = poiName
    ? locationTag
      ? `${poiName} — ${locationTag}`
      : poiName
    : locationTag || placeName;
  const freeform = addr?.freeformAddress ?? label;

  return {
    id: r.id,
    label,
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

/** Busca direta no Photon (OSM) quando a API estiver indisponível. */
export async function searchSuggestionsDirect(
  query: string,
  lat?: number,
  lon?: number
): Promise<AddressSuggestion[]> {
  if (query.trim().length < MIN_QUERY_LEN) return [];

  const url = new URL(`${PHOTON_BASE}/api/`);
  url.searchParams.set('q', query.trim());
  url.searchParams.set('limit', '8');
  url.searchParams.set('bbox', PHOTON_BR_BBOX);
  if (lat !== undefined && lon !== undefined) {
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lon', String(lon));
  }

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Photon search ${res.status}`);

  const data = (await res.json()) as {
    features?: Array<{
      geometry: { coordinates: [number, number] };
      properties: Record<string, string | number | undefined>;
    }>;
  };

  return (data.features ?? [])
    .filter((f) => {
      const cc = String(f.properties.countrycode ?? f.properties.country ?? '').toUpperCase();
      return !cc || cc === 'BR';
    })
    .map((f) => {
    const [lonVal, latVal] = f.geometry.coordinates;
    const props = f.properties;
    const name = String(props.name ?? props.street ?? props.city ?? 'Destino').trim();
    const city = String(props.city ?? props.county ?? '').trim();
    const district = String(props.district ?? props.locality ?? '').trim();
    const stateCode = photonStateCode(String(props.state ?? ''));
    const address: AddressFields = {
      freeformAddress: [name, props.street, city, stateCode].filter(Boolean).join(', '),
      municipality: city,
      municipalitySubdivision: district,
      countrySubdivision: String(props.state ?? ''),
      countrySubdivisionCode: stateCode,
    };
    return parseSuggestion({
      id: String(props.osm_id ?? `${latVal}-${lonVal}`),
      address,
      position: { lat: latVal, lon: lonVal },
    });
  });
}
