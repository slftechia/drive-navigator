import { useEffect, useState } from 'react';
import { formatDurationClock, formatEtaTime, formatNavDistanceKm } from '../lib/routeFormat';

interface NavBottomBarProps {
  arrivalTime: Date;
  durationRemainingMinutes: number;
  distanceRemainingKm: number;
  followingGps: boolean;
  routeOverview?: boolean;
  onRecenter: () => void;
  onViewRoute: () => void;
  onOpenMenu: () => void;
  onEndNavigation: () => void;
}

export default function NavBottomBar({
  arrivalTime,
  durationRemainingMinutes,
  distanceRemainingKm,
  followingGps,
  routeOverview = false,
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

  let leftLabel = 'Ver rota';
  let leftAction = onViewRoute;
  if (routeOverview) {
    leftLabel = 'Voltar';
    leftAction = onRecenter;
  } else if (!followingGps) {
    leftLabel = 'Re-centralizar';
    leftAction = onRecenter;
  }

  const eta = formatEtaTime(arrivalTime);
  const durationLabel = formatDurationClock(durationRemainingMinutes);
  const distanceLabel = formatNavDistanceKm(distanceRemainingKm);

  return (
    <div className="nav-bottom-bar">
      <button type="button" className="nav-bottom-action" onClick={leftAction}>
        {leftLabel}
      </button>
      <div className="nav-bottom-stats">
        <div className="nav-bottom-eta">{eta}</div>
        <div className="nav-bottom-sub">
          <span>{durationLabel}</span>
          <span className="nav-bottom-dot">·</span>
          <span>{distanceLabel}</span>
        </div>
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
