interface ArrivalSheetProps {
  destinationLabel: string;
  onEnd: () => void;
  onContinue: () => void;
}

export default function ArrivalSheet({ destinationLabel, onEnd, onContinue }: ArrivalSheetProps) {
  return (
    <div className="arrival-sheet-backdrop" role="dialog" aria-labelledby="arrival-title">
      <div className="arrival-sheet">
        <div className="arrival-sheet-icon" aria-hidden="true">
          🏁
        </div>
        <h2 id="arrival-title">Você chegou!</h2>
        <p>{destinationLabel}</p>
        <div className="arrival-sheet-actions">
          <button type="button" className="primary" onClick={onEnd}>
            Encerrar navegação
          </button>
          <button type="button" className="ghost" onClick={onContinue}>
            Continuar no mapa
          </button>
        </div>
      </div>
    </div>
  );
}
