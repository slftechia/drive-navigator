import type { ReportType } from '../lib/userReports';

interface ReportSheetProps {
  onClose: () => void;
  onReport: (type: ReportType) => void;
}

const OPTIONS: Array<{ type: ReportType; icon: string; label: string; hint: string }> = [
  { type: 'radar', icon: '📷', label: 'Radar', hint: 'Fiscalização à frente' },
  { type: 'lombada', icon: '◆', label: 'Lombada', hint: 'Redutor de velocidade' },
  { type: 'perigo', icon: '⚠️', label: 'Perigo', hint: 'Obstáculo / risco na via' },
];

/** Painel rápido estilo Waze para reportar alerta na posição atual. */
export default function ReportSheet({ onClose, onReport }: ReportSheetProps) {
  return (
    <div className="consult-overlay report-overlay" onClick={onClose}>
      <div className="report-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Reportar alerta">
        <div className="consult-handle" />
        <h2>Reportar na sua posição</h2>
        <p className="field-hint">O alerta aparece no mapa e é enviado à comunidade quando online.</p>
        <div className="report-grid">
          {OPTIONS.map((opt) => (
            <button
              key={opt.type}
              type="button"
              className="report-option"
              onClick={() => onReport(opt.type)}
            >
              <span className="report-option-icon" aria-hidden>
                {opt.icon}
              </span>
              <strong>{opt.label}</strong>
              <em>{opt.hint}</em>
            </button>
          ))}
        </div>
        <button type="button" className="ghost report-cancel" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
