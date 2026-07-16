import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './index.css';

/** Muda a cada release — limpa cache do PWA instalado. */
const BUILD_ID = '2026-07-16-alerts-zoom-waze-v1';

async function ensureFreshBuild() {
  try {
    const prev = localStorage.getItem('dn-build');
    if (prev === BUILD_ID) return false;
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    localStorage.setItem('dn-build', BUILD_ID);
    if (prev) {
      window.location.reload();
      return true;
    }
  } catch {
    localStorage.setItem('dn-build', BUILD_ID);
  }
  return false;
}

void (async () => {
  const reloading = await ensureFreshBuild();
  if (reloading) return;

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      updateSW(true);
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      void registration.update();
      window.setInterval(() => {
        void registration.update();
      }, 20_000);
    },
  });

  createRoot(document.getElementById('root')!).render(<App />);
})();
