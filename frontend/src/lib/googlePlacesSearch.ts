import type { AddressSuggestion } from '../api';

const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ?? '';

export function hasGooglePlaces(): boolean {
  return GOOGLE_KEY.length > 10;
}

type AutocompleteSuggestion = {
  placePrediction?: {
    placeId?: string;
    text?: { text?: string };
    structuredFormat?: {
      mainText?: { text?: string };
      secondaryText?: { text?: string };
    };
  };
};

type PlaceDetails = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  addressComponents?: Array<{
    longText?: string;
    shortText?: string;
    types?: string[];
  }>;
};

function stateFromComponents(components?: PlaceDetails['addressComponents']): string {
  const admin = components?.find((c) => c.types?.includes('administrative_area_level_1'));
  return (admin?.shortText ?? '').replace(/^BR-/, '').toUpperCase();
}

function cityFromComponents(components?: PlaceDetails['addressComponents']): string {
  const city = components?.find(
    (c) =>
      c.types?.includes('locality') ||
      c.types?.includes('administrative_area_level_2') ||
      c.types?.includes('sublocality')
  );
  return city?.longText ?? '';
}

async function fetchPlaceDetails(placeId: string): Promise<AddressSuggestion | null> {
  const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
    headers: {
      'X-Goog-Api-Key': GOOGLE_KEY,
      'X-Goog-FieldMask':
        'id,displayName,formattedAddress,location,addressComponents',
    },
  });
  if (!res.ok) return null;
  const place = (await res.json()) as PlaceDetails;
  const lat = place.location?.latitude;
  const lon = place.location?.longitude;
  if (lat == null || lon == null) return null;

  const placeName = place.displayName?.text?.trim() || 'Destino';
  const city = cityFromComponents(place.addressComponents);
  const stateCode = stateFromComponents(place.addressComponents);
  const address = place.formattedAddress ?? [city, stateCode].filter(Boolean).join(', ');
  const locationTag = stateCode || city ? `${placeName} — ${[city, stateCode].filter(Boolean).join('/')}` : placeName;

  return {
    id: `g-${place.id ?? placeId}`,
    label: locationTag,
    placeName,
    city: city || placeName,
    stateCode,
    locationTag: placeName,
    address,
    lat,
    lon,
    resultKind: 'poi',
  };
}

/** Autocomplete Google Places (New) — qualidade Maps/Waze. */
export async function searchGooglePlaces(
  query: string,
  lat?: number,
  lon?: number
): Promise<AddressSuggestion[]> {
  if (!hasGooglePlaces() || query.trim().length < 2) return [];

  const body: Record<string, unknown> = {
    input: query.trim(),
    languageCode: 'pt-BR',
    includedRegionCodes: ['br'],
  };

  if (lat != null && lon != null && Number.isFinite(lat) && Number.isFinite(lon)) {
    body.locationBias = {
      circle: {
        center: { latitude: lat, longitude: lon },
        radius: 50_000,
      },
    };
  }

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 6_000);
  try {
    const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_KEY,
        'X-Goog-FieldMask':
          'suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return [];

    const data = (await res.json()) as { suggestions?: AutocompleteSuggestion[] };
    const predictions = (data.suggestions ?? [])
      .map((s) => s.placePrediction)
      .filter((p): p is NonNullable<typeof p> => Boolean(p?.placeId))
      .slice(0, 8);

    const details = await Promise.all(
      predictions.map(async (p) => {
        const detail = await fetchPlaceDetails(p.placeId!);
        if (detail) return detail;
        // Fallback sem lat/lon não serve para rota
        return null;
      })
    );

    return details.filter((d): d is AddressSuggestion => d != null);
  } catch {
    return [];
  } finally {
    window.clearTimeout(timer);
  }
}
