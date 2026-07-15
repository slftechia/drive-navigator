export type SavedSlot = 'home' | 'work';

export interface SavedPlace {
  id: string;
  label: string;
  placeName?: string;
  city?: string;
  stateCode?: string;
  locationTag?: string;
  address?: string;
  lat: number;
  lon: number;
  kind: SavedSlot | 'favorite';
  updatedAt: number;
}

interface SavedPlacesState {
  home: SavedPlace | null;
  work: SavedPlace | null;
  favorites: SavedPlace[];
}

const KEY = 'drive-nav-saved-places-v1';
const MAX_FAVORITES = 20;

const EMPTY: SavedPlacesState = { home: null, work: null, favorites: [] };

function isPlace(v: unknown): v is SavedPlace {
  if (!v || typeof v !== 'object') return false;
  const p = v as SavedPlace;
  return (
    typeof p.id === 'string' &&
    typeof p.label === 'string' &&
    typeof p.lat === 'number' &&
    typeof p.lon === 'number' &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lon)
  );
}

export function loadSavedPlaces(): SavedPlacesState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY, favorites: [] };
    const parsed = JSON.parse(raw) as Partial<SavedPlacesState>;
    return {
      home: isPlace(parsed.home) ? parsed.home : null,
      work: isPlace(parsed.work) ? parsed.work : null,
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites.filter(isPlace).slice(0, MAX_FAVORITES) : [],
    };
  } catch {
    return { ...EMPTY, favorites: [] };
  }
}

function persist(state: SavedPlacesState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* quota */
  }
}

function fromPick(
  pick: {
    label: string;
    placeName?: string;
    city?: string;
    stateCode?: string;
    locationTag?: string;
    lat: number;
    lon: number;
  },
  kind: SavedPlace['kind']
): SavedPlace {
  return {
    id: `${kind}-${pick.lat.toFixed(5)}-${pick.lon.toFixed(5)}`,
    label: pick.label,
    placeName: pick.placeName,
    city: pick.city,
    stateCode: pick.stateCode,
    locationTag: pick.locationTag,
    lat: pick.lat,
    lon: pick.lon,
    kind,
    updatedAt: Date.now(),
  };
}

export function setHomePlace(pick: {
  label: string;
  placeName?: string;
  city?: string;
  stateCode?: string;
  locationTag?: string;
  lat: number;
  lon: number;
}): SavedPlacesState {
  const state = loadSavedPlaces();
  state.home = fromPick(pick, 'home');
  persist(state);
  return state;
}

export function setWorkPlace(pick: {
  label: string;
  placeName?: string;
  city?: string;
  stateCode?: string;
  locationTag?: string;
  lat: number;
  lon: number;
}): SavedPlacesState {
  const state = loadSavedPlaces();
  state.work = fromPick(pick, 'work');
  persist(state);
  return state;
}

export function clearHomePlace(): SavedPlacesState {
  const state = loadSavedPlaces();
  state.home = null;
  persist(state);
  return state;
}

export function clearWorkPlace(): SavedPlacesState {
  const state = loadSavedPlaces();
  state.work = null;
  persist(state);
  return state;
}

export function addFavorite(pick: {
  label: string;
  placeName?: string;
  city?: string;
  stateCode?: string;
  locationTag?: string;
  lat: number;
  lon: number;
}): SavedPlacesState {
  const state = loadSavedPlaces();
  const place = fromPick(pick, 'favorite');
  state.favorites = [
    place,
    ...state.favorites.filter(
      (f) => !(Math.abs(f.lat - place.lat) < 1e-4 && Math.abs(f.lon - place.lon) < 1e-4)
    ),
  ].slice(0, MAX_FAVORITES);
  persist(state);
  return state;
}

export function removeFavorite(id: string): SavedPlacesState {
  const state = loadSavedPlaces();
  state.favorites = state.favorites.filter((f) => f.id !== id);
  persist(state);
  return state;
}

export function savedPlaceToDestination(place: SavedPlace): {
  label: string;
  placeName?: string;
  city?: string;
  stateCode?: string;
  locationTag?: string;
  lat: number;
  lon: number;
} {
  return {
    label: place.label,
    placeName: place.placeName,
    city: place.city,
    stateCode: place.stateCode,
    locationTag: place.locationTag || place.placeName || place.label,
    lat: place.lat,
    lon: place.lon,
  };
}
