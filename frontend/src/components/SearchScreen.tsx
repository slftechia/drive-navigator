import { useState, useEffect, useRef, useCallback, type KeyboardEvent } from 'react';
import { searchSuggestions, type AddressSuggestion } from '../api';
import { haversineKm, formatDistanceKm } from '../utils/geo';
import type { SelectedDestination } from './DestinationInput';

interface SearchScreenProps {
  userLat: number;
  userLon: number;
  originLabel: string;
  onBack: () => void;
  onPick: (dest: SelectedDestination) => void;
}

const DEBOUNCE_MS = 350;
const MIN_QUERY_LEN = 3;

export default function SearchScreen({ userLat, userLon, originLabel, onBack, onPick }: SearchScreenProps) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [searchError, setSearchError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const userPosRef = useRef({ lat: userLat, lon: userLon });
  const requestIdRef = useRef(0);
  const lastFetchedQueryRef = useRef('');

  userPosRef.current = { lat: userLat, lon: userLon };

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < MIN_QUERY_LEN) {
      requestIdRef.current += 1;
      setSuggestions([]);
      setLoading(false);
      setSearchError(null);
      lastFetchedQueryRef.current = '';
      return;
    }

    if (trimmed === lastFetchedQueryRef.current) return;

    const id = ++requestIdRef.current;
    setLoading(true);
    setSearchError(null);

    try {
      const { lat, lon } = userPosRef.current;
      const results = await searchSuggestions(trimmed, lat, lon);
      if (id !== requestIdRef.current) return;
      lastFetchedQueryRef.current = trimmed;
      setSuggestions(results);
      setActiveIndex(-1);
      if (results.length === 0) setSearchError('Nenhum local encontrado.');
    } catch {
      if (id !== requestIdRef.current) return;
      lastFetchedQueryRef.current = '';
      setSuggestions([]);
      setSearchError('Busca indisponível. Verifique a conexão e tente de novo.');
    } finally {
      if (id === requestIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => runSearch(query), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, runSearch]);

  const select = (s: AddressSuggestion) => {
    requestIdRef.current += 1;
    setLoading(false);
    onPick({
      label: s.label,
      placeName: s.placeName,
      city: s.city,
      stateCode: s.stateCode,
      locationTag: s.locationTag,
      lat: s.lat,
      lon: s.lon,
    });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && suggestions[activeIndex]) {
        select(suggestions[activeIndex]);
      } else if (query.trim()) {
        onPick({ label: query.trim() });
      }
      return;
    }
    if (!suggestions.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    }
  };

  const showLoading = loading && query.trim().length >= MIN_QUERY_LEN && suggestions.length === 0;

  return (
    <div className="search-screen">
      <div className="search-screen-header">
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Voltar">
          ←
        </button>
        <div className="search-screen-input-wrap">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              const next = e.target.value;
              if (next.trim() !== lastFetchedQueryRef.current) {
                setLoading(next.trim().length >= MIN_QUERY_LEN);
              }
              setQuery(next);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Para onde?"
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button type="button" className="search-clear" onClick={() => setQuery('')} aria-label="Limpar">
              ×
            </button>
          )}
        </div>
      </div>

      <p className="search-origin-line">
        <span className="search-origin-dot" />
        De: {originLabel}
      </p>

      {showLoading && <p className="search-loading">Buscando...</p>}
      {!loading && searchError && <p className="search-error">{searchError}</p>}

      <ul className="search-results" role="listbox">
        {suggestions.map((s, i) => {
          const dist = formatDistanceKm(haversineKm(userLat, userLon, s.lat, s.lon));
          return (
            <li
              key={s.id}
              role="option"
              aria-selected={i === activeIndex}
              className={i === activeIndex ? 'active' : ''}
              onMouseDown={(e) => {
                e.preventDefault();
                select(s);
              }}
            >
              <span className="search-result-pin">📍</span>
              <div className="search-result-text">
                <strong>{s.locationTag || s.placeName || s.label}</strong>
                <span>{s.address !== s.label ? s.address : s.city && s.stateCode ? `${s.city}, ${s.stateCode}` : ''}</span>
              </div>
              <span className="search-result-dist">{dist}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
