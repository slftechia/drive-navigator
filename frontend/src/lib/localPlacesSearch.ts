import type { AddressSuggestion } from '../api';
import { haversineKm } from '../utils/geo';
import { brandTokens, queryTokens, textMatchesAllTokens } from './photonSearch';

const OVERPASS_ENDPOINTS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
];

type OsmElement = {
  id: number;
  type: 'node' | 'way' | 'relation';
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function escapeOverpassRegex(q: string): string {
  return q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function pickName(tags: Record<string, string>): string {
  return (
    tags.name ??
    tags.brand ??
    tags.operator ??
    tags['addr:street'] ??
    tags.shop ??
    'Local'
  );
}

function pickAddress(tags: Record<string, string>): string {
  const parts = [
    tags['addr:street'],
    tags['addr:housenumber'],
    tags['addr:suburb'] ?? tags['addr:neighbourhood'],
    tags['addr:city'] ?? tags['addr:town'],
    tags['addr:state'],
  ].filter(Boolean);
  return parts.join(', ');
}

function elementCoords(el: OsmElement): { lat: number; lon: number } | null {
  if (el.lat != null && el.lon != null) return { lat: el.lat, lon: el.lon };
  if (el.center) return { lat: el.center.lat, lon: el.center.lon };
  return null;
}

function buildPatterns(query: string): string[] {
  const tokens = queryTokens(query);
  const patterns = new Set<string>();
  const full = normalize(query);
  if (full.length >= 2) patterns.add(escapeOverpassRegex(full));

  if (tokens.length >= 2) {
    patterns.add(tokens.map(escapeOverpassRegex).join('.*'));
    const distinctive = [...tokens].sort((a, b) => b.length - a.length)[0];
    if (distinctive) patterns.add(escapeOverpassRegex(distinctive));
  } else if (tokens.length === 1) {
    patterns.add(escapeOverpassRegex(tokens[0]));
  }

  return [...patterns];
}

function buildNameQuery(lat: number, lon: number, query: string, radiusM: number): string {
  const around = `around:${radiusM},${lat.toFixed(5)},${lon.toFixed(5)}`;
  const patterns = buildPatterns(query);
  const tokens = queryTokens(query);
  const clauses: string[] = [];

  for (const pattern of patterns) {
    clauses.push(`node(${around})["name"~"${pattern}",i];`);
    clauses.push(`way(${around})["name"~"${pattern}",i];`);
    clauses.push(`relation(${around})["name"~"${pattern}",i];`);
    clauses.push(`node(${around})["brand"~"${pattern}",i];`);
    clauses.push(`way(${around})["brand"~"${pattern}",i];`);
    clauses.push(`node(${around})["addr:street"~"${pattern}",i];`);
    clauses.push(`way(${around})["addr:street"~"${pattern}",i];`);
  }

  const nameHint = tokens.find((t) => !['oficina', 'mecanica', 'mecânica', 'auto', 'carro'].includes(t));
  if (tokens.some((t) => ['oficina', 'mecanica', 'mecânica'].includes(t)) && nameHint) {
    const hint = escapeOverpassRegex(nameHint);
    for (const pair of [
      ['amenity', 'car_repair'],
      ['shop', 'car_repair'],
      ['shop', 'car'],
    ] as const) {
      clauses.push(`node(${around})["${pair[0]}"="${pair[1]}"]["name"~"${hint}",i];`);
      clauses.push(`way(${around})["${pair[0]}"="${pair[1]}"]["name"~"${hint}",i];`);
    }
  }

  if (tokens.some((t) => ['posto', 'gasolina', 'combustivel', 'combustível'].includes(t)) && nameHint) {
    const hint = escapeOverpassRegex(nameHint);
    clauses.push(`node(${around})["amenity"="fuel"]["name"~"${hint}",i];`);
    clauses.push(`way(${around})["amenity"="fuel"]["name"~"${hint}",i];`);
  }

  return `[out:json][timeout:10];
(
  ${clauses.join('\n  ')}
);
out center 35;`;
}

function toSuggestion(el: OsmElement, tokens: string[], brands: string[]): AddressSuggestion | null {
  const tags = el.tags ?? {};
  const coords = elementCoords(el);
  if (!coords) return null;

  const name = pickName(tags);
  const hay = [name, tags.brand, tags.operator, tags['addr:street'], tags['addr:suburb']]
    .filter(Boolean)
    .join(' ');
  // Aceita match da marca sozinha ("Quevedo" em "Quevedo materiais")
  const ok =
    (tokens.length > 0 && textMatchesAllTokens(hay, tokens)) ||
    (brands.length > 0 && textMatchesAllTokens(hay, brands)) ||
    (brands.length === 1 && hay.toLowerCase().includes(brands[0]));
  if (!ok) return null;

  const city = tags['addr:city'] ?? tags['addr:town'] ?? tags['addr:municipality'] ?? '';
  const district = tags['addr:suburb'] ?? tags['addr:neighbourhood'] ?? '';
  const state = tags['addr:state'] ?? '';
  const stateCode = state.length === 2 ? state.toUpperCase() : '';
  const address = pickAddress(tags) || [district, city, stateCode].filter(Boolean).join(', ');

  return {
    id: `osm-${el.type}-${el.id}`,
    label: name,
    placeName: name,
    city: city || name,
    stateCode,
    locationTag: name,
    address,
    lat: coords.lat,
    lon: coords.lon,
    resultKind: 'poi',
  };
}

/** Busca nomes no OSM ao redor do GPS (lojas, ruas, escolas…). */
export async function fetchLocalPlacesByName(
  query: string,
  lat: number,
  lon: number,
  radiusKm: number
): Promise<AddressSuggestion[]> {
  const trimmed = query.trim();
  const tokens = queryTokens(trimmed);
  const brands = brandTokens(trimmed);
  if (tokens.length === 0 && brands.length === 0) return [];

  const radiusM = Math.round(radiusKm * 1000);
  // Busca Overpass pela marca (mais efetiva que frase completa)
  const searchText = brands.join(' ') || trimmed;
  const overpassQuery = buildNameQuery(lat, lon, searchText, radiusM);

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 7_000);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(overpassQuery)}`,
        signal: controller.signal,
      });
      window.clearTimeout(timer);
      if (!res.ok) continue;

      const data = (await res.json()) as { elements?: OsmElement[] };
      const seen = new Set<string>();
      const out: AddressSuggestion[] = [];

      for (const el of data.elements ?? []) {
        const s = toSuggestion(el, tokens, brands);
        if (!s) continue;
        const key = `${s.lat.toFixed(4)}-${s.lon.toFixed(4)}-${s.placeName}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(s);
      }

      out.sort(
        (a, b) =>
          haversineKm(lat, lon, a.lat, a.lon) - haversineKm(lat, lon, b.lat, b.lon)
      );
      return out;
    } catch {
      continue;
    }
  }
  return [];
}
