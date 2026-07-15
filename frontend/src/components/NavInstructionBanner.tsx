import type { RouteInstruction } from '../api';
import { turnBannerHtml, turnThenHtml } from '../lib/turnIcons';
import { haversineKm, formatDistanceKm } from '../utils/geo';

interface NavInstructionBannerProps {
  instruction: RouteInstruction | null;
  thenInstruction?: RouteInstruction | null;
  userLat: number;
  userLon: number;
  destinationLabel: string;
  recalculating?: boolean;
  arrived?: boolean;
}

function stripHtml(message?: string): string {
  return message?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() ?? '';
}

/** Extrai nome da via da frase de manobra (estilo Waze). */
function streetFromMessage(message: string): string {
  const m =
    message.match(/\bem\s+(.+)$/i) ||
    message.match(/\bna\s+(.+)$/i) ||
    message.match(/\bno\s+(.+)$/i) ||
    message.match(/\bpara\s+(.+)$/i);
  return (m?.[1] ?? message).replace(/\.$/, '').trim();
}

export default function NavInstructionBanner({
  instruction,
  thenInstruction = null,
  userLat,
  userLon,
  destinationLabel,
  recalculating = false,
  arrived = false,
}: NavInstructionBannerProps) {
  const distM = instruction
    ? haversineKm(userLat, userLon, instruction.lat, instruction.lon) * 1000
    : 0;
  const distLabel =
    distM >= 1000
      ? formatDistanceKm(distM / 1000)
      : `${Math.max(50, Math.round(distM / 50) * 50)} m`;
  const raw = stripHtml(instruction?.message) || `Seguir para ${destinationLabel}`;
  const street = streetFromMessage(raw);

  if (arrived) {
    return (
      <div className="nav-instruction-banner nav-arrived">
        <div className="nav-instruction-main">
          <div className="nav-instruction-icon" aria-hidden="true">🏁</div>
          <div className="nav-instruction-copy">
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
          <div className="nav-instruction-copy">
            <strong>Recalculando rota…</strong>
            <span>Ajustando o caminho a partir da sua posição</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="nav-instruction-stack">
      <div className="nav-instruction-banner">
        <div className="nav-instruction-main">
          <div
            className="nav-instruction-icon"
            dangerouslySetInnerHTML={{
              __html: turnBannerHtml(instruction?.instructionType, instruction?.message),
            }}
          />
          <div className="nav-instruction-copy">
            <strong>{distLabel}</strong>
            <span>{street}</span>
          </div>
        </div>
      </div>
      {thenInstruction && (
        <div className="nav-instruction-then">
          <span className="nav-instruction-then-label">em seguida</span>
          <span
            className="nav-instruction-then-icon"
            dangerouslySetInnerHTML={{
              __html: turnThenHtml(thenInstruction.instructionType, thenInstruction.message),
            }}
          />
        </div>
      )}
    </div>
  );
}
