export type MusicAppId = 'spotify' | 'youtube' | 'deezer';

const APPS: Record<MusicAppId, { https: string; intent?: string }> = {
  spotify: {
    https: 'https://open.spotify.com/',
    intent: 'spotify://',
  },
  youtube: {
    https: 'https://music.youtube.com/',
  },
  deezer: {
    https: 'https://www.deezer.com/',
    intent: 'deezer://www.deezer.com/',
  },
};

/** Abre app de música (deep link se possível, senão web). */
export function openMusicApp(id: MusicAppId): void {
  const app = APPS[id];
  if (!app) return;
  const scheme = app.intent;
  if (scheme) {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = scheme;
    document.body.appendChild(iframe);
    window.setTimeout(() => {
      try {
        document.body.removeChild(iframe);
      } catch {
        /* ignore */
      }
      window.open(app.https, '_blank', 'noopener,noreferrer');
    }, 700);
    return;
  }
  window.open(app.https, '_blank', 'noopener,noreferrer');
}
