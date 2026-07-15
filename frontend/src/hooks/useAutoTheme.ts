import { useEffect, useState } from 'react';
import { themeFromLocalTime, type AppTheme } from '../lib/theme';

/** Alterna o tema da UI conforme o horário local (estilo Waze). */
export function useAutoTheme(): AppTheme {
  const [theme, setTheme] = useState<AppTheme>(() => themeFromLocalTime());

  useEffect(() => {
    const apply = () => {
      const next = themeFromLocalTime();
      setTheme(next);
      document.documentElement.dataset.theme = next;
      document.documentElement.style.colorScheme = next === 'night' ? 'dark' : 'light';
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', next === 'night' ? '#0b1220' : '#e8eef5');
    };

    apply();
    const id = window.setInterval(apply, 60_000);
    return () => window.clearInterval(id);
  }, []);

  return theme;
}
