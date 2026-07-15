import { TERMS_VERSION, PRIVACY_VERSION } from '../lib/legal';

interface LegalConsentModalProps {
  onAccept: () => void;
  onOpenTerms: () => void;
  onOpenPrivacy: () => void;
}

/** Primeira abertura / nova versão dos textos legais. */
export default function LegalConsentModal({
  onAccept,
  onOpenTerms,
  onOpenPrivacy,
}: LegalConsentModalProps) {
  return (
    <div className="legal-consent-overlay" role="dialog" aria-modal="true" aria-labelledby="legal-consent-title">
      <div className="legal-consent-card">
        <h2 id="legal-consent-title">Bem-vindo ao Drive Navigator</h2>
        <p>
          Usamos sua localização para navegação, alertas na rota e estimativas. Dados de busca e
          lugares salvos ficam neste aparelho.
        </p>
        <p className="legal-consent-meta">
          Ao continuar, você concorda com os{' '}
          <button type="button" className="legal-link" onClick={onOpenTerms}>
            Termos de Uso
          </button>{' '}
          e a{' '}
          <button type="button" className="legal-link" onClick={onOpenPrivacy}>
            Política de Privacidade
          </button>
          .
        </p>
        <p className="field-hint">Versões: termos {TERMS_VERSION} · privacidade {PRIVACY_VERSION}</p>
        <button type="button" className="primary legal-consent-accept" onClick={onAccept}>
          Concordo e continuar
        </button>
      </div>
    </div>
  );
}
