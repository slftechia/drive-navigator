import { useState, useEffect, useRef, useCallback, type KeyboardEvent, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { searchSuggestions, type AddressSuggestion } from '../api';

export interface SelectedDestination {
  label: string;
  placeName?: string;
  city?: string;
  stateCode?: string;
  locationTag?: string;
  lat?: number;
  lon?: number;
}

interface DestinationInputProps {
  value: string;
  onChange: (value: string) => void;
  onPick: (dest: SelectedDestination) => void;
  onDropdownOpenChange?: (open: boolean) => void;
  userLat?: number;
  userLon?: number;
  placeholder?: string;
  disabled?: boolean;
}

export default function DestinationInput({
  value,
  onChange,
  onPick,
  onDropdownOpenChange,
  userLat,
  userLon,
  placeholder = 'Ex: Curitiba, PR',
  disabled = false,
}: DestinationInputProps) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [listStyle, setListStyle] = useState<CSSProperties>({});
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const userPosRef = useRef({ lat: userLat, lon: userLon });
  const requestIdRef = useRef(0);
  const lastFetchedQueryRef = useRef('');
  userPosRef.current = { lat: userLat, lon: userLon };

  const setDropdownOpen = useCallback(
    (next: boolean) => {
      setOpen(next);
      onDropdownOpenChange?.(next);
    },
    [onDropdownOpenChange]
  );

  const updateListPosition = useCallback(() => {
    if (!inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    setListStyle({
      position: 'fixed',
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
      zIndex: 1100,
    });
  }, []);

  const fetchSuggestions = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      if (trimmed.length < 3) {
        requestIdRef.current += 1;
        setSuggestions([]);
        setDropdownOpen(false);
        setLoading(false);
        lastFetchedQueryRef.current = '';
        return;
      }

      if (trimmed === lastFetchedQueryRef.current) return;

      const id = ++requestIdRef.current;
      setLoading(true);
      try {
        const { lat, lon } = userPosRef.current;
        const results = await searchSuggestions(trimmed, lat, lon);
        if (id !== requestIdRef.current) return;
        lastFetchedQueryRef.current = trimmed;
        setSuggestions(results);
        const shouldOpen = results.length > 0;
        setDropdownOpen(shouldOpen);
        setActiveIndex(-1);
        if (shouldOpen) updateListPosition();
      } catch {
        if (id !== requestIdRef.current) return;
        setSuggestions([]);
        setDropdownOpen(false);
      } finally {
        if (id === requestIdRef.current) setLoading(false);
      }
    },
    [setDropdownOpen, updateListPosition]
  );

  useEffect(() => {
    const timer = setTimeout(() => fetchSuggestions(value), 350);
    return () => clearTimeout(timer);
  }, [value, fetchSuggestions]);

  useEffect(() => {
    if (!open) return;
    updateListPosition();
    const onScrollOrResize = () => updateListPosition();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open, suggestions, updateListPosition]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapperRef.current?.contains(target)) return;
      if ((target as Element).closest?.('.autocomplete-list-portal')) return;
      setDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [setDropdownOpen]);

  const pickSuggestion = (s: AddressSuggestion) => {
    const dest: SelectedDestination = {
      label: s.label,
      placeName: s.placeName,
      city: s.city,
      stateCode: s.stateCode,
      locationTag: s.locationTag,
      lat: s.lat,
      lon: s.lon,
    };
    onChange(s.label);
    setDropdownOpen(false);
    setSuggestions([]);
    onPick(dest);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (open && activeIndex >= 0 && suggestions[activeIndex]) {
        pickSuggestion(suggestions[activeIndex]);
      } else if (value.trim()) {
        setDropdownOpen(false);
        setSuggestions([]);
        onPick({ label: value.trim() });
      }
      return;
    }

    if (!open || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Escape') {
      setDropdownOpen(false);
    }
  };

  const suggestionsList =
    open && suggestions.length > 0 ? (
      <ul className="autocomplete-list autocomplete-list-portal" style={listStyle} role="listbox">
        {suggestions.map((s, i) => (
          <li
            key={s.id}
            role="option"
            aria-selected={i === activeIndex}
            className={i === activeIndex ? 'active' : ''}
            onMouseDown={(e) => {
              e.preventDefault();
              pickSuggestion(s);
            }}
          >
            <span className="autocomplete-label">{s.label}</span>
            {s.address && s.address !== s.label && (
              <span className="autocomplete-address">{s.address}</span>
            )}
          </li>
        ))}
      </ul>
    ) : null;

  return (
    <div className="autocomplete" ref={wrapperRef}>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => {
          if (suggestions.length > 0) {
            updateListPosition();
            setDropdownOpen(true);
          }
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
      />
      {loading && <span className="autocomplete-spinner" />}
      {suggestionsList && createPortal(suggestionsList, document.body)}
    </div>
  );
}
