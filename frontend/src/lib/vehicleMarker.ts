/** Seta de navegação estilo Waze — alto contraste sobre a linha azul da rota. */
export function vehicleMarkerHtml(headingDeg: number | null, mapRotatesWithHeading = false): string {
  const rot =
    mapRotatesWithHeading || !Number.isFinite(headingDeg) ? 0 : Math.round(headingDeg!);
  const uid = `wv${Math.abs(Math.round((headingDeg ?? 0) * 1000)) % 100000}`;

  return `<div class="wz-vehicle-puck" style="transform:rotate(${rot}deg)" aria-hidden="true">
    <div class="wz-vehicle-puck-ring"></div>
    <svg class="wz-vehicle-puck-arrow" width="36" height="36" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="wz-arrow-${uid}" x1="18" y1="4" x2="18" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#ffffff"/>
          <stop offset="55%" stop-color="#fde68a"/>
          <stop offset="100%" stop-color="#f59e0b"/>
        </linearGradient>
        <filter id="wz-shadow-${uid}" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="1.8" flood-color="#000" flood-opacity="0.55"/>
        </filter>
      </defs>
      <path filter="url(#wz-shadow-${uid})" fill="url(#wz-arrow-${uid})" stroke="#1e293b" stroke-width="1.5" stroke-linejoin="round"
        d="M18 5 C20 5 21.5 6.5 22 8.5 L28 26 C28.8 28.2 27 30 25 29 L18 25 L11 29 C9 30 7.2 28.2 8 26 L14 8.5 C14.5 6.5 16 5 18 5 Z"/>
    </svg>
  </div>`;
}
