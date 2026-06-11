import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const SW_PURGE_KEY = 'drive-nav-sw-purged-v45';

/** Remove SW/cache antigo que impedia tiles do mapa no celular. */
async function purgeLegacyServiceWorker(): Promise<void> {
  const prev = localStorage.getItem(SW_PURGE_KEY);
  const hadSw = 'serviceWorker' in navigator && (await navigator.serviceWorker.getRegistrations()).length > 0;
  const hadCaches = 'caches' in window && (await caches.keys()).length > 0;

  if (prev && !hadSw && !hadCaches) return;

  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }

  if ('serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
    localStorage.setItem(SW_PURGE_KEY, '1');
    if (regs.length > 0 || hadCaches) {
      window.location.reload();
      return;
    }
  }

  localStorage.setItem(SW_PURGE_KEY, '1');
}

purgeLegacyServiceWorker().finally(() => {
  createRoot(document.getElementById('root')!).render(<App />);
});
