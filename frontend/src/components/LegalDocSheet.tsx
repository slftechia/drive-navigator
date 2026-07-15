import type { LegalDoc } from '../lib/legal';
import { TERMS_VERSION, PRIVACY_VERSION } from '../lib/legal';

interface LegalDocSheetProps {
  doc: LegalDoc;
  onClose: () => void;
}

export default function LegalDocSheet({ doc, onClose }: LegalDocSheetProps) {
  const isTerms = doc === 'terms';

  return (
    <div className="consult-overlay" onClick={onClose}>
      <div className="consult-sheet legal-doc-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="consult-handle" />
        <div className="consult-header">
          <h2>{isTerms ? 'Termos de Uso' : 'Privacidade'}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
        <div className="consult-body legal-doc-body">
          {isTerms ? <TermsBody /> : <PrivacyBody />}
        </div>
      </div>
    </div>
  );
}

function TermsBody() {
  return (
    <>
      <p className="field-hint">Versão {TERMS_VERSION}</p>
      <h3>1. Serviço</h3>
      <p>
        O Drive Navigator é um aplicativo de navegação e alertas de estrada oferecido “como está”.
        Rotas, tempos e alertas dependem de mapas e dados de terceiros e podem conter imprecisões.
      </p>
      <h3>2. Uso responsável</h3>
      <p>
        Você é responsável pela condução segura. O app não substitui atenção ao trânsito, sinalização
        oficial nem regras de trânsito. Não use o aparelho de forma que distraia.
      </p>
      <h3>3. Conta e dados locais</h3>
      <p>
        Preferências, histórico, casa/trabalho e favoritos são armazenados no seu dispositivo.
        Relatos de alertas feitos por você nesta versão ficam locais (não há comunidade sincronizada ainda).
      </p>
      <h3>4. Limitação</h3>
      <p>
        Na medida permitida pela lei, não nos responsabilizamos por decisões tomadas com base no app
        (rotas, alertas, combustível ou ETA).
      </p>
      <h3>5. Contato</h3>
      <p>Dúvidas: use o canal de suporte do publicador do app / site do projeto.</p>
    </>
  );
}

function PrivacyBody() {
  return (
    <>
      <p className="field-hint">Versão {PRIVACY_VERSION} · LGPD</p>
      <h3>Dados que usamos</h3>
      <ul className="legal-list">
        <li>
          <strong>Localização (GPS)</strong> — para mostrar sua posição, calcular rotas, ETA e alertas
          próximos. Processada no dispositivo e, quando necessário, enviada a serviços de mapa/rota
          (ex.: OSRM/Photon/provedores configurados).
        </li>
        <li>
          <strong>Destinos e histórico</strong> — no armazenamento local do navegador/PWA.
        </li>
        <li>
          <strong>Preferências</strong> — sons, voz, veículo e tema.
        </li>
        <li>
          <strong>Relatos de alertas</strong> — guardados localmente neste aparelho.
        </li>
      </ul>
      <h3>Bases e direitos (LGPD)</h3>
      <p>
        Tratamos dados para execução do serviço solicitado e, quando cabível, com base no seu
        consentimento. Você pode limpar dados do app nas configurações do navegador/PWA (cache e
        armazenamento do site).
      </p>
      <h3>Compartilhamento</h3>
      <p>
        Posição e destinos podem ser enviados a APIs de mapas/busca/rota necessárias à navegação.
        Não vendemos seus dados. Google Places (se configurado) segue a política do Google.
      </p>
      <h3>Retenção</h3>
      <p>
        Dados locais permanecem até você apagá-los ou desinstalar/limpar o site. Relatos locais têm
        validade limitada (~14 dias).
      </p>
      <h3>Contato do controlador</h3>
      <p>Para solicitações LGPD, contate o publicador do Drive Navigator pelo canal de suporte.</p>
    </>
  );
}
