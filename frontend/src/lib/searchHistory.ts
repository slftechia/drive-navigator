import type { AddressSuggestion } from '../api';

const KEY = 'drive-nav-search-history-v1';
const MAX = 8;

export type RecentSearch = Pick<
  AddressSuggestion,
  'id' | 'label' | 'placeName' | 'city' | 'stateCode' | 'locationTag' | 'address' | 'lat' | 'lon' | 'resultKind'
>;

export function loadRecentSearches(): RecentSearch[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentSearch[];
    return Array.isArray(parsed) ? parsed.slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function saveRecentSearch(item: RecentSearch): void {
  try {
    const prev = loadRecentSearches().filter(
      (r) => !(Math.abs(r.lat - item.lat) < 1e-4 && Math.abs(r.lon - item.lon) < 1e-4 && r.placeName === item.placeName)
    );
    const next = [item, ...prev].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
}

export function removeRecentSearch(item: Pick<RecentSearch, 'lat' | 'lon' | 'placeName' | 'id'>): void {
  try {
    const next = loadRecentSearches().filter((r) => {
      if (item.id && r.id && item.id === r.id) return false;
      const sameCoords =
        Math.abs(r.lat - item.lat) < 1e-4 && Math.abs(r.lon - item.lon) < 1e-4;
      if (sameCoords && r.placeName === item.placeName) return false;
      return true;
    });
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function clearRecentSearches(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
