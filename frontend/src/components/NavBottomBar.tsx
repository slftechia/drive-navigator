import { useEffect, useState } from 'react';
import { formatDurationClock, formatEtaTime, formatNavDistanceKm } from '../lib/routeFormat';
import type { TrafficLevel } from '../lib/trafficEstimate';

interface NavBottomBarProps {
  arrivalTime: Date;
  durationRemainingMinutes: number;
  distanceRemainingKm: number;
  followingGps: boolean;
  routeOverview?: boolean;
  trafficHint?: string | null;
  trafficLevel?: TrafficLevel | null;
  onRecenter: () => void;
  onViewRoute: () => void;
  onOpenMenu: () => void;
  onEndNavigation: () => void;
}

/** Barra inferior estilo Waze: tempo · ETA · distância + Recentralizar. */
export default function NavBottomBar({
  arrivalTime,
  durationRemainingMinutes,
  distanceRemainingKm,
  followingGps,
  routeOverview = false,
  trafficHint = null,
  trafficLevel = null,
  onRecenter,
  onViewRoute,
  onOpenMenu,
  onEndNavigation,
}: NavBottomBarProps) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const needsRecenter = routeOverview || !followingGps;
  const eta = formatEtaTime(arrivalTime);
  const durationLabel = formatDurationClock(durationRemainingMinutes);
  const distanceLabel = formatNavDistanceKm(distanceRemainingKm);

  return (
    <div className="nav-bottom-bar">
      {needsRecenter ? (
        <button type="button" className="nav-recenter-btn" onClick={onRecenter}>
          <span className="nav-recenter-icon" aria-hidden>
            ◎
          </span>
          Recentralizar
        </button>
      ) : (
        <button
          type="button"
          className="nav-bottom-icon-btn"
          onClick={onViewRoute}
          aria-label="Ver rota"
        >
          🔍
        </button>
      )}

      <div className="nav-bottom-stats nav-bottom-stats-waze">
        <span className="nav-bottom-chip">{durationLabel}</span>
        <span className="nav-bottom-chip nav-bottom-chip-eta">{eta}</span>
        <span className="nav-bottom-chip">{distanceLabel}</span>
        {trafficHint && (
          <span
            className={`nav-bottom-chip nav-bottom-traffic${
              trafficLevel ? ` traffic-${trafficLevel}` : ''
            }`}
          >
            {trafficHint}
          </span>
        )}
      </div>

      <div className="nav-bottom-right">
        <button type="button" className="nav-bottom-end" onClick={onEndNavigation} aria-label="Encerrar navegação">
          ✕
        </button>
        <button type="button" className="nav-bottom-menu" onClick={onOpenMenu}>
          Geral
        </button>
      </div>
    </div>
  );
}
