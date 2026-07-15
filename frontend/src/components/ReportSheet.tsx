import { ALERT_TYPE_META, type RoadAlertType } from '../lib/alertTypes';
import type { ReportType } from '../lib/userReports';

interface ReportSheetProps {
  onClose: () => void;
  onReport: (type: ReportType) => void;
}

const OPTIONS = (Object.values(ALERT_TYPE_META) as Array<(typeof ALERT_TYPE_META)[RoadAlertType]>).filter(
  (m) => m.reportable
);

/** Painel estilo Waze para reportar alerta na posição atual (comunidade). */
export default function ReportSheet({ onClose, onReport }: ReportSheetProps) {
  return (
    <div className="consult-overlay report-overlay" onClick={onClose}>
      <div className="report-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Reportar alerta">
        <div className="consult-handle" />
        <h2>Alertar outros motoristas</h2>
        <p className="field-hint">Como no Waze: seu report aparece no mapa e na comunidade.</p>
        <div className="report-grid report-grid-wide">
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
