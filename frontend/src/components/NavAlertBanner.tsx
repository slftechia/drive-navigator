import type { RoadAlert } from '../api';
import { alertTypeLabel } from '../lib/roadAlerts';

interface NavAlertBannerProps {
  alert: RoadAlert | null;
  distanceMeters: number;
}

function formatAhead(meters: number): string {
  if (meters >= 1000) {
    const km = meters / 1000;
    return km >= 10 ? `${Math.round(km)} km` : `${km.toFixed(1).replace('.', ',')} km`;
  }
  const rounded = Math.max(30, Math.round(meters / 10) * 10);
  return `${rounded} m`;
}

function iconFor(type: RoadAlert['type']): string {
  if (type === 'lombada') {
    return `<svg width="28" height="28" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M3 15 H21" stroke="#1e293b" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M6 15 L9 8 L12 15 L15 8 L18 15" fill="none" stroke="#1e293b" stroke-width="2" stroke-linejoin="round"/>
    </svg>`;
  }
  if (type === 'radar') {
    return `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="7" y="9" width="10" height="7" rx="1.5" fill="#fff"/>
      <circle cx="12" cy="12.5" r="2.6" fill="#e63900"/>
      <path d="M12 4v2M12 18v2M4 12h2M18 12h2" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>
    </svg>`;
  }
  return '⚠';
}

/** Faixa “Lombadas em 80 m” estilo Waze. */
export default function NavAlertBanner({ alert, distanceMeters }: NavAlertBannerProps) {
  if (!alert || distanceMeters <= 0 || distanceMeters > 500) return null;

  const label =
    alert.type === 'lombada' ? 'Lombadas' : alert.type === 'perigo' ? 'Perigo' : `${alertTypeLabel(alert.type)}`;
  const ahead = formatAhead(distanceMeters);

  return (
    <div className={`nav-alert-banner nav-alert-${alert.type}`} role="status">
      <span
        className="nav-alert-icon"
        dangerouslySetInnerHTML={{ __html: iconFor(alert.type) }}
      />
      <strong>
        {label} em {ahead}
      </strong>
    </div>
  );
}
