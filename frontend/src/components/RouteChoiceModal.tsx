import { useEffect, useRef, useState } from 'react';
import type { SelectedDestination } from './DestinationInput';

export type RouteMode = 'preview' | 'navigate';

interface RouteChoiceModalProps {
  destination: SelectedDestination;
  onChoose: (mode: RouteMode) => void;
  onCancel: () => void;
  countdownSeconds?: number;
}

export default function RouteChoiceModal({
  destination,
  onChoose,
  onCancel,
  countdownSeconds = 10,
}: RouteChoiceModalProps) {
  const [seconds, setSeconds] = useState(countdownSeconds);
  const chosenRef = useRef(false);
  const onChooseRef = useRef(onChoose);
  onChooseRef.current = onChoose;

  const choose = (mode: RouteMode) => {
    if (chosenRef.current) return;
    chosenRef.current = true;
    onChooseRef.current(mode);
  };

  useEffect(() => {
    chosenRef.current = false;
    setSeconds(countdownSeconds);
  }, [destination.label, destination.lat, destination.lon, countdownSeconds]);

  useEffect(() => {
    if (seconds <= 0) {
      choose('navigate');
      return;
    }
    const timer = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);

  const progress = ((countdownSeconds - seconds) / countdownSeconds) * 100;
  const displayDest = destination.locationTag ?? destination.label;

  return (
    <div className="route-choice-overlay" onClick={onCancel} role="dialog" aria-modal="true">
      <div className="route-choice-card" onClick={(e) => e.stopPropagation()}>
        <div className="route-choice-handle" aria-hidden="true" />

        <p className="route-choice-dest">{displayDest}</p>
        <p className="route-choice-sub">Como deseja seguir?</p>

        <p className="route-choice-timer-label">
          Ir agora em <strong>{seconds}s</strong>
        </p>
        <div className="route-choice-timer" aria-hidden="true">
          <div className="route-choice-timer-bar" style={{ width: `${100 - progress}%` }} />
        </div>

        <div className="route-choice-actions">
          <button
            type="button"
            className="primary route-choice-btn route-choice-btn-go"
            onClick={() => choose('navigate')}
          >
            Ir agora
          </button>
          <button type="button" className="secondary route-choice-btn" onClick={() => choose('preview')}>
            Ver rota
          </button>
        </div>
      </div>
    </div>
  );
}
