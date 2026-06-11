import type { RouteInstruction } from '../api';
import { turnBannerHtml } from '../lib/turnIcons';
import { haversineKm, formatDistanceKm } from '../utils/geo';

interface NavInstructionBannerProps {
  instruction: RouteInstruction | null;
  userLat: number;
  userLon: number;
  destinationLabel: string;
  recalculating?: boolean;
  arrived?: boolean;
}

export default function NavInstructionBanner({
  instruction,
  userLat,
  userLon,
  destinationLabel,
  recalculating = false,
  arrived = false,
}: NavInstructionBannerProps) {
  const distM = instruction
    ? haversineKm(userLat, userLon, instruction.lat, instruction.lon) * 1000
    : 0;
  const distLabel = distM >= 1000 ? formatDistanceKm(distM / 1000) : `${Math.max(50, Math.round(distM / 50) * 50)} m`;
  const instructionText =
    instruction?.message?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() ??
    `Seguir para ${destinationLabel}`;

  if (arrived) {
    return (
      <div className="nav-instruction-banner nav-arrived">
        <div className="nav-instruction-main">
          <div className="nav-instruction-icon" aria-hidden="true">🏁</div>
          <div>
            <strong>Chegou!</strong>
            <span>{destinationLabel}</span>
          </div>
        </div>
      </div>
    );
  }

  if (recalculating) {
    return (
      <div className="nav-instruction-banner nav-recalculating">
        <div className="nav-instruction-main">
          <div className="nav-recalc-spinner" aria-hidden="true" />
          <div>
            <strong>Recalculando rota…</strong>
            <span>Ajustando o caminho a partir da sua posição</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="nav-instruction-banner">
      <div className="nav-instruction-main">
        <div
          className="nav-instruction-icon"
          dangerouslySetInnerHTML={{
            __html: turnBannerHtml(instruction?.instructionType, instruction?.message),
          }}
        />
        <div>
          <strong>{distLabel}</strong>
          <span>{instructionText}</span>
        </div>
      </div>
    </div>
  );
}
