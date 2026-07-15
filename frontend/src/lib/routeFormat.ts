import type { RouteAlternative } from '../api';

export function formatRouteDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `${h}h ${m}min`;
  return `${m} min`;
}

/** Hora prevista de chegada (estilo Waze). */
export function formatEtaTime(date: Date): string {
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** Duração restante estilo Waze: "4 min" ou "1 h 12 min". */
export function formatDurationClock(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${Math.max(1, total)} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m > 0 ? `${h} h ${m} min` : `${h} h`;
}

/** Distância restante na barra de navegação (metros quando &lt; 1 km). */
export function formatNavDistanceKm(km: number): string {
  if (km < 0.05) return '0 m';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

export function formatTollSummary(alt: Pick<RouteAlternative, 'hasTolls' | 'tollCount' | 'tollCostEstimateBrl'>): string {
  if (!alt.hasTolls) return 'Sem pedágios';
  const count = alt.tollCount > 0 ? `${alt.tollCount} pedágio${alt.tollCount > 1 ? 's' : ''}` : 'Com pedágios';
  if (alt.tollCostEstimateBrl != null && alt.tollCostEstimateBrl > 0) {
    const value = alt.tollCostEstimateBrl.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      maximumFractionDigits: 0,
    });
    return `${count} · ≈ ${value}`;
  }
  return count;
}

export function routeAlternativeToRoute(alt: RouteAlternative) {
  const { id: _id, kind: _k, label: _l, hasTolls: _h, tollCount: _t, tollCostEstimateBrl: _c, ...route } = alt;
  return route;
}
