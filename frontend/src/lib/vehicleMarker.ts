/**
 * Ícone do veículo estilo Waze:
 * seta azul clara + anel claro + glow (não é carro 3D).
 */
export function vehicleMarkerHtml(headingDeg: number | null, mapRotatesWithHeading = false): string {
  const rot =
    mapRotatesWithHeading || !Number.isFinite(headingDeg) ? 0 : Math.round(headingDeg!);

  return `<div style="width:64px;height:64px;transform:rotate(${rot}deg);transform-origin:32px 36px;pointer-events:none;line-height:0" aria-hidden="true">
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" style="display:block;overflow:visible">
  <defs>
    <radialGradient id="wzGlow" cx="50%" cy="55%" r="50%">
      <stop offset="0%" stop-color="#7dd3fc" stop-opacity="0.55"/>
      <stop offset="55%" stop-color="#38bdf8" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#38bdf8" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="wzFace" x1="32" y1="8" x2="32" y2="52" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#e0f2fe"/>
      <stop offset="45%" stop-color="#38bdf8"/>
      <stop offset="100%" stop-color="#0284c7"/>
    </linearGradient>
  </defs>
  <circle cx="32" cy="38" r="26" fill="url(#wzGlow)"/>
  <circle cx="32" cy="38" r="17" fill="rgba(14,165,233,0.22)" stroke="#bae6fd" stroke-width="2.5"/>
  <path d="M32 10 L48 50 L32 42 L16 50 Z" fill="#0369a1" opacity="0.9"/>
  <path d="M32 8 L46 48 L32 40.5 L18 48 Z" fill="url(#wzFace)" stroke="#f0f9ff" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="M32 14 L35.2 32 L32 29.5 L28.8 32 Z" fill="#ffffff" opacity="0.75"/>
</svg>
</div>`;
}
