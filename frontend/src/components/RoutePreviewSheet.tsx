import { useEffect, useRef, useState } from 'react';
import type { RouteAlternative } from '../api';
import type { SelectedDestination } from './DestinationInput';
import { formatRouteDuration, formatTollSummary } from '../lib/routeFormat';

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

export default function RoutePreviewSheet({
  alternatives,
  selectedRouteId,
  onSelectRoute,
  destination,
  originLabel,
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
    onChoose(mode);
  };

  useEffect(() => {
    chosenRef.current = false;
    setSeconds(countdownSeconds);
  }, [destination.label, selectedRouteId, countdownSeconds]);

  useEffect(() => {
    if (seconds <= 0) {
      choose('navigate');
      return;
    }
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  if (!selected) return null;

  const progress = ((countdownSeconds - seconds) / countdownSeconds) * 100;
  const destLabel = destination.locationTag ?? destination.label;

  return (
    <div className="route-preview-sheet">
      <button type="button" className="route-preview-back icon-btn" onClick={onBack} aria-label="Voltar">
        ←
      </button>

      <p className="route-preview-route">
        {originLabel} → {destLabel}
      </p>

      <div className="route-alt-list" role="listbox" aria-label="Rotas disponíveis">
        {alternatives.map((alt) => {
          const active = alt.id === selectedRouteId;
          return (
            <button
              key={alt.id}
              type="button"
              role="option"
              aria-selected={active}
              className={`route-alt-card${active ? ' route-alt-card-active' : ''}`}
              onClick={() => onSelectRoute(alt.id)}
            >
              <div className="route-alt-card-main">
                <strong>{formatRouteDuration(alt.totalDurationMinutes)}</strong>
                <span>{alt.totalDistanceKm.toFixed(0)} km</span>
              </div>
              <div className="route-alt-card-meta">
                <span className="route-alt-label">{alt.label}</span>
                <span className="route-alt-toll">{formatTollSummary(alt)}</span>
              </div>
            </button>
          );
        })}
      </div>

      <p className="route-choice-timer-label">
        Ir agora em <strong>{seconds}s</strong>
      </p>
      <div className="route-choice-timer" aria-hidden="true">
        <div className="route-choice-timer-bar" style={{ width: `${100 - progress}%` }} />
      </div>

      <div className="route-preview-actions">
        <button type="button" className="secondary route-preview-btn" onClick={() => choose('preview')}>
          Ver rota
        </button>
        <button type="button" className="primary route-preview-btn-go" onClick={() => choose('navigate')}>
          Ir agora
        </button>
      </div>
    </div>
  );
}
