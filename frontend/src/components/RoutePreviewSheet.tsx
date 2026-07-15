import { useEffect, useRef, useState } from 'react';
import type { RouteAlternative } from '../api';
import type { SelectedDestination } from './DestinationInput';
import { formatRouteDuration, formatTollSummary } from '../lib/routeFormat';
import {
  estimateTrafficFromRoute,
  trafficRelativeHint,
  type TrafficLevel,
} from '../lib/trafficEstimate';

export type RouteMode = 'preview' | 'navigate';

interface RoutePreviewSheetProps {
  alternatives: RouteAlternative[];
  selectedRouteId: string;
  onSelectRoute: (id: string) => void;
  destination: SelectedDestination;
  originLabel: string;
  onChoose: (mode: RouteMode) => void;
  onBack: () => void;
  countdownSeconds?: number;
}

function routeViaLabel(alt: RouteAlternative): string {
  const msgs = (alt.instructions ?? [])
    .map((i) => i.message?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const streets: string[] = [];
  for (const msg of msgs) {
    const m =
      msg.match(/\bem\s+(.+)$/i) ||
      msg.match(/\bna\s+(.+)$/i) ||
      msg.match(/\bno\s+(.+)$/i);
    const name = (m?.[1] ?? '').replace(/\.$/, '').trim();
    if (name && name.length > 3 && !streets.includes(name)) streets.push(name);
    if (streets.length >= 3) break;
  }
  if (streets.length) return `Por ${streets.join(', ')}`;
  return alt.label || 'Rota sugerida';
}

function trafficClass(level: TrafficLevel): string {
  if (level === 'busy') return 'traffic-busy';
  if (level === 'moderate') return 'traffic-moderate';
  if (level === 'free') return 'traffic-free';
  return 'traffic-unknown';
}

export default function RoutePreviewSheet({
  alternatives,
  selectedRouteId,
  onSelectRoute,
  destination,
  originLabel: _originLabel,
  onChoose,
  onBack,
  countdownSeconds = 10,
}: RoutePreviewSheetProps) {
  const [seconds, setSeconds] = useState(countdownSeconds);
  const chosenRef = useRef(false);

  const selected =
    alternatives.find((a) => a.id === selectedRouteId) ?? alternatives[0];

  const choose = (mode: RouteMode) => {
    if (chosenRef.current) return;
    chosenRef.current = true;
    setSeconds(-1); // cancela auto-início
    onChoose(mode);
  };

  useEffect(() => {
    chosenRef.current = false;
    setSeconds(countdownSeconds);
  }, [destination.label, selectedRouteId, countdownSeconds]);

  useEffect(() => {
    if (chosenRef.current) return;
    if (seconds < 0) return;
    if (seconds === 0) {
      choose('navigate');
      return;
    }
    const t = setTimeout(() => {
      if (!chosenRef.current) setSeconds((s) => s - 1);
    }, 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  if (!selected) return null;

  const destLabel = destination.locationTag ?? destination.label;
  const via = routeViaLabel(selected);
  const toll = formatTollSummary(selected);
  const traffic = estimateTrafficFromRoute(selected.totalDistanceKm, selected.totalDurationMinutes);
  const fastest = Math.min(...alternatives.map((a) => a.totalDurationMinutes));
  const relative = trafficRelativeHint(selected.totalDurationMinutes, fastest);

  return (
    <div className="route-preview-sheet">
      <div className="route-preview-top">
        <button type="button" className="route-preview-back icon-btn" onClick={onBack} aria-label="Voltar">
          ←
        </button>
        <div className="route-preview-dest">
          <strong>{destLabel}</strong>
        </div>
      </div>

      {alternatives.length > 1 && (
        <div className="route-alt-chips" role="listbox" aria-label="Rotas disponíveis">
          {alternatives.map((alt, idx) => {
            const active = alt.id === selectedRouteId;
            return (
              <button
                key={alt.id}
                type="button"
                role="option"
                aria-selected={active}
                className={`route-alt-chip${active ? ' route-alt-chip-active' : ''}`}
                onClick={() => onSelectRoute(alt.id)}
              >
                <strong>{formatRouteDuration(alt.totalDurationMinutes)}</strong>
                {idx === 0 && <em className="route-alt-best">Melhor</em>}
              </button>
            );
          })}
        </div>
      )}

      <div className="route-preview-head-stats">
        <strong className="route-preview-time">{formatRouteDuration(selected.totalDurationMinutes)}</strong>
        <span className="route-preview-km">{selected.totalDistanceKm.toFixed(1).replace('.', ',')} km</span>
        <span className={`route-preview-traffic-pill ${trafficClass(traffic.level)}`}>
          {traffic.level === 'free'
            ? 'Livre'
            : traffic.level === 'moderate'
              ? 'Moderado'
              : traffic.level === 'busy'
                ? 'Intenso'
                : 'Estimativa'}
        </span>
      </div>

      <p className="route-preview-via">{via}</p>
      <p className={`route-preview-status ${trafficClass(traffic.level)}`}>
        {traffic.label}
        {relative ? ` · ${relative}` : ''}
        {toll ? ` · ${toll}` : ''}
        {seconds > 0 ? ` · inicia em ${seconds}s` : ''}
      </p>

      <div className="route-preview-actions">
        <button type="button" className="route-preview-btn-later" onClick={() => choose('preview')}>
          Sair depois
        </button>
        <button type="button" className="route-preview-btn-go" onClick={() => choose('navigate')}>
          Ir agora
        </button>
      </div>
    </div>
  );
}
