import { useState, useEffect, useRef, useCallback, useMemo, type KeyboardEvent } from 'react';
import { searchSuggestions, type AddressSuggestion } from '../api';
import { haversineKm, formatDistanceKm } from '../utils/geo';
import { brandTokens } from '../lib/photonSearch';
import {
  clearRecentSearches,
  loadRecentSearches,
  removeRecentSearch,
  saveRecentSearch,
  type RecentSearch,
} from '../lib/searchHistory';
import { looksLikeLocationLink, parseLocationLink } from '../lib/parseLocationLink';
import type { SelectedDestination } from './DestinationInput';

interface SearchScreenProps {
  userLat: number;
  userLon: number;
  originLabel: string;
  onBack: () => void;
  onPick: (dest: SelectedDestination) => void;
}

const DEBOUNCE_MS = 200;
const MIN_QUERY_LEN = 2;
const NEARBY_KM = 60;

function kindIcon(kind?: AddressSuggestion['resultKind']): string {
  if (kind === 'admin') return '🏙️';
  if (kind === 'street') return '🛣️';
  if (kind === 'poi') return '📍';
  return '📌';
}

export default function SearchScreen({ userLat, userLon, originLabel, onBack, onPick }: SearchScreenProps) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchTip, setSearchTip] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentSearch[]>(() => loadRecentSearches());
  const inputRef = useRef<HTMLInputElement>(null);
  const userPosRef = useRef({ lat: userLat, lon: userLon });
  const requestIdRef = useRef(0);
  const lastFetchedQueryRef = useRef('');

  userPosRef.current = { lat: userLat, lon: userLon };

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const brandHint = useMemo(() => {
    const brands = brandTokens(query);
    if (brands.length === 0) return null;
    const brandQ = brands.join(' ');
    if (brandQ.toLowerCase() === query.trim().toLowerCase()) return null;
    return brandQ;
  }, [query]);

  const { nearby, farther } = useMemo(() => {
    const near: AddressSuggestion[] = [];
    const far: AddressSuggestion[] = [];
    for (const s of suggestions) {
      const d = haversineKm(userLat, userLon, s.lat, s.lon);
      if (d <= NEARBY_KM) near.push(s);
      else far.push(s);
    }
    return { nearby: near, farther: far };
  }, [suggestions, userLat, userLon]);

  const flatList = useMemo(() => [...nearby, ...farther], [nearby, farther]);

  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < MIN_QUERY_LEN) {
      requestIdRef.current += 1;
      setSuggestions([]);
      setLoading(false);
      setSearchError(null);
      setSearchTip(null);
      lastFetchedQueryRef.current = '';
      return;
    }

    if (trimmed === lastFetchedQueryRef.current) return;

    const id = ++requestIdRef.current;
    setLoading(true);
    setSearchError(null);
    setSearchTip(null);

    try {
      const { lat, lon } = userPosRef.current;
      const results = await searchSuggestions(trimmed, lat, lon, (partial) => {
        if (id !== requestIdRef.current) return;
        if (partial.length > 0) {
          setSuggestions(partial);
          setLoading(false);
          setSearchError(null);
        }
      });
      if (id !== requestIdRef.current) return;
      lastFetchedQueryRef.current = trimmed;
      setSuggestions(results);
      setActiveIndex(-1);

      if (results.length === 0) {
        const brands = brandTokens(trimmed);
        const tipBrand = brands.join(' ');
        setSearchError('Nenhum local encontrado neste mapa gratuito.');
        if (tipBrand && tipBrand.toLowerCase() !== trimmed.toLowerCase()) {
          setSearchTip(`Tente só “${tipBrand}” — lojas sem cadastro openstreetmap podem não aparecer.`);
        } else {
          setSearchTip('Experimente o nome da cidade (ex.: Rio Verde GO) ou um nome mais curto.');
        }
      } else {
        const brands = brandTokens(trimmed);
        if (brands.length > 0 && brands.join(' ').length < trimmed.length) {
          const onlyBrandMatches = results.every((s) => {
            const hay = `${s.placeName} ${s.address}`.toLowerCase();
            return brands.some((b) => hay.includes(b));
          });
          if (onlyBrandMatches && trimmed.split(/\s+/).length >= 2) {
            setSearchTip('Mostrando resultados pelo nome principal. Lojas privadas podem não estar no mapa aberto.');
          }
        }
      }
    } catch {
      if (id !== requestIdRef.current) return;
      lastFetchedQueryRef.current = '';
      setSuggestions([]);
      setSearchError('Busca indisponível. Verifique a conexão e tente de novo.');
      setSearchTip(null);
    } finally {
      if (id === requestIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (looksLikeLocationLink(query)) {
      const parsed = parseLocationLink(query);
      if (parsed) {
        requestIdRef.current += 1;
        setLoading(false);
        setSuggestions([]);
        setSearchError(null);
        setSearchTip(`Link detectado (${parsed.source}). Abrindo local…`);
        const timer = setTimeout(() => {
          onPick({
            label: parsed.label,
            placeName: parsed.label,
            locationTag: parsed.label,
            lat: parsed.lat,
            lon: parsed.lon,
            resultKind: 'poi',
          });
        }, 280);
        return () => clearTimeout(timer);
      }
      if (/goo\.gl|maps\.app\.goo\.gl/i.test(query)) {
        setSearchTip('Link curto do Google: abra no Maps, toque em Compartilhar → Copiar e cole o link completo com coordenadas.');
        setSuggestions([]);
        setLoading(false);
        return;
      }
    }
    const timer = setTimeout(() => runSearch(query), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, runSearch, onPick]);

  const select = (s: AddressSuggestion | RecentSearch) => {
    requestIdRef.current += 1;
    setLoading(false);
    saveRecentSearch({
      id: s.id,
      label: s.label,
      placeName: s.placeName,
      city: s.city,
      stateCode: s.stateCode,
      locationTag: s.locationTag,
      address: s.address,
      lat: s.lat,
      lon: s.lon,
      resultKind: s.resultKind,
    });
    setRecent(loadRecentSearches());
    onPick({
      label: s.label,
      placeName: s.placeName,
      city: s.city,
      stateCode: s.stateCode,
      locationTag: s.locationTag,
      address: s.address,
      resultKind: s.resultKind,
      lat: s.lat,
      lon: s.lon,
    });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && flatList[activeIndex]) {
        select(flatList[activeIndex]);
      } else if (query.trim().length >= MIN_QUERY_LEN && flatList[0]) {
        select(flatList[0]);
      }
      return;
    }
    if (!flatList.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flatList.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    }
  };

  const showLoading = loading && query.trim().length >= MIN_QUERY_LEN && suggestions.length === 0;
  const showRecent = query.trim().length < MIN_QUERY_LEN && recent.length > 0;

  const renderRow = (s: AddressSuggestion, i: number) => {
    const dist = formatDistanceKm(haversineKm(userLat, userLon, s.lat, s.lon));
    return (
      <li
        key={`${s.id}-${i}`}
        role="option"
        aria-selected={i === activeIndex}
        className={i === activeIndex ? 'active' : ''}
        onMouseDown={(e) => {
          e.preventDefault();
          select(s);
        }}
      >
        <span className="search-result-pin">{kindIcon(s.resultKind)}</span>
        <div className="search-result-text">
          <strong>{s.placeName || s.locationTag || s.label}</strong>
          <span>{s.address}</span>
        </div>
        <span className="search-result-dist">{dist}</span>
      </li>
    );
  };

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
            placeholder="Cole um link Maps/Waze ou busque…"
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

      {brandHint && query.trim().length >= MIN_QUERY_LEN && (
        <button type="button" className="search-chip" onClick={() => setQuery(brandHint)}>
          Buscar só “{brandHint}”
        </button>
      )}

      {showLoading && <p className="search-loading">Buscando...</p>}
      {!loading && searchError && <p className="search-error">{searchError}</p>}
      {!loading && searchTip && (
        <p className="search-tip">
          {searchTip}
          {brandHint && searchError && (
            <>
              {' '}
              <button type="button" className="search-tip-link" onClick={() => setQuery(brandHint)}>
                Buscar “{brandHint}”
              </button>
            </>
          )}
        </p>
      )}

      {showRecent && (
        <div className="search-section">
          <div className="search-section-head">
            <h3>Recentes</h3>
            <button
              type="button"
              className="search-section-clear"
              onClick={() => {
                if (!window.confirm('Apagar todo o histórico de recentes?')) return;
                clearRecentSearches();
                setRecent([]);
              }}
            >
              Limpar tudo
            </button>
          </div>
          <ul className="search-results" role="listbox">
            {recent.map((s, i) => (
              <li key={`r-${s.id}-${i}`} className="search-recent-item" role="option">
                <button
                  type="button"
                  className="search-recent-pick"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    select(s);
                  }}
                >
                  <span className="search-result-pin">🕒</span>
                  <div className="search-result-text">
                    <strong>{s.placeName || s.label}</strong>
                    <span>{s.address || s.locationTag}</span>
                  </div>
                </button>
                <button
                  type="button"
                  className="search-recent-remove"
                  aria-label={`Remover ${s.placeName || s.label} dos recentes`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    removeRecentSearch(s);
                    setRecent(loadRecentSearches());
                  }}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className="search-results" role="listbox">
        {nearby.length > 0 && (
          <>
            <li className="search-group-label" aria-hidden>
              Perto de você
            </li>
            {nearby.map((s, i) => renderRow(s, i))}
          </>
        )}
        {farther.length > 0 && (
          <>
            <li className="search-group-label" aria-hidden>
              {nearby.length > 0 ? 'Outras cidades e locais' : 'Resultados'}
            </li>
            {farther.map((s, i) => renderRow(s, nearby.length + i))}
          </>
        )}
      </ul>
    </div>
  );
}
