import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener('beforeinstallprompt', onBip);

    if (isIos()) {
      const dismissed = localStorage.getItem('drive-install-dismissed');
      if (!dismissed) setVisible(true);
      setIosHint(true);
    }

    return () => window.removeEventListener('beforeinstallprompt', onBip);
  }, []);

  const install = async () => {
    if (deferred) {
      await deferred.prompt();
      await deferred.userChoice;
      setDeferred(null);
      setVisible(false);
      return;
    }
    if (iosHint) {
      alert('No Safari: toque em Compartilhar → "Adicionar à Tela de Início".');
    }
  };

  const dismiss = () => {
    localStorage.setItem('drive-install-dismissed', '1');
    setVisible(false);
  };

  if (!visible || isStandalone()) return null;

  return (
    <div className="install-prompt">
      <button type="button" className="install-prompt-btn" onClick={() => void install()}>
        Instalar app
      </button>
      <button type="button" className="install-prompt-dismiss" onClick={dismiss} aria-label="Fechar">
        ×
      </button>
    </div>
  );
}
