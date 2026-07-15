export type AppTheme = 'day' | 'night';

export const MAP_STYLE_DAY = 'https://tiles.openfreemap.org/styles/liberty';
export const MAP_STYLE_NIGHT = 'https://tiles.openfreemap.org/styles/dark';

/** Noite aproximada BR (18:30–06:00). */
export function themeFromLocalTime(date = new Date()): AppTheme {
  const minutes = date.getHours() * 60 + date.getMinutes();
  const nightStart = 18 * 60 + 30;
  const nightEnd = 6 * 60;
  if (minutes >= nightStart || minutes < nightEnd) return 'night';
  return 'day';
}

export function mapStyleForTheme(theme: AppTheme): string {
  return theme === 'night' ? MAP_STYLE_NIGHT : MAP_STYLE_DAY;
}

export function routeColorsForTheme(theme: AppTheme) {
  if (theme === 'night') {
    return {
      main: '#22d3ee',
      casing: '#0e7490',
      alt: '#64748b',
      halo: '#083344',
    };
  }
  return {
    main: '#7c3aed',
    casing: '#4c1d95',
    alt: '#64748b',
    halo: '#ffffff',
  };
}
