/** Ícones estilo Waze para marcadores HTML no mapa. */

export function alertMarkerSizePx(zoom: number | null): number {
  if (zoom == null || !Number.isFinite(zoom)) return 30;
  if (zoom >= 17) return 36;
  if (zoom >= 15) return 30;
  if (zoom >= 13) return 24;
  return 20;
}

export function radarMarkerHtml(zoom: number | null = null): string {
  const px = alertMarkerSizePx(zoom);
  const icon = Math.round(px * 0.48);
  return `<div style="width:${px}px;height:${px}px;border-radius:50%;background:linear-gradient(180deg,#ff6b35,#e63900);border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;pointer-events:none" aria-label="Radar">
    <svg width="${icon}" height="${icon}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="7" y="9" width="10" height="7" rx="1.5" fill="white"/>
      <circle cx="12" cy="12.5" r="2.8" fill="#e63900"/>
      <path d="M12 4v2M12 18v2M4 12h2M18 12h2" stroke="white" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M17.7 6.3l-1.4 1.4M7.7 16.3l-1.4 1.4" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
  </div>`;
}

export function lombadaMarkerHtml(zoom: number | null = null): string {
  const px = alertMarkerSizePx(zoom);
  const icon = Math.round(px * 0.5);
  return `<div style="width:${px}px;height:${px}px;background:linear-gradient(180deg,#fde047,#facc15);border:2.5px solid #1e293b;transform:rotate(45deg);box-shadow:0 2px 8px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;pointer-events:none" aria-label="Lombada">
    <svg width="${icon}" height="${icon}" viewBox="0 0 24 24" style="transform:rotate(-45deg)" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 15 H21" stroke="#1e293b" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M6 15 L9 8 L12 15 L15 8 L18 15" fill="none" stroke="#1e293b" stroke-width="2" stroke-linejoin="round"/>
      <path d="M5 17 H19" stroke="#1e293b" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
  </div>`;
}

export function hazardMarkerHtml(zoom: number | null = null): string {
  const px = alertMarkerSizePx(zoom);
  const icon = Math.round(px * 0.55);
  return `<div style="width:${px}px;height:${px}px;border-radius:50%;background:linear-gradient(180deg,#fb923c,#ea580c);border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;pointer-events:none" aria-label="Perigo">
    <svg width="${icon}" height="${icon}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 3 L22 20 H2 Z" fill="white"/>
      <rect x="11" y="9" width="2" height="6" rx="1" fill="#ea580c"/>
      <circle cx="12" cy="17.2" r="1.2" fill="#ea580c"/>
    </svg>
  </div>`;
}

/** Marcador genérico com emoji (alertas da comunidade). */
export function communityAlertMarkerHtml(
  emoji: string,
  bg: string,
  zoom: number | null = null,
  label = 'Alerta'
): string {
  const px = alertMarkerSizePx(zoom);
  const font = Math.max(12, Math.round(px * 0.48));
  return `<div style="width:${px}px;height:${px}px;border-radius:50%;background:${bg};border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;pointer-events:none;font-size:${font}px;line-height:1" aria-label="${label}">${emoji}</div>`;
}

export function fuelMarkerHtml(zoom: number | null = null, label?: string): string {
  const px = zoom != null && zoom >= 15 ? 34 : 28;
  const icon = Math.round(px * 0.5);
  const name = label ? `<span style="position:absolute;left:50%;top:100%;transform:translateX(-50%);margin-top:3px;white-space:nowrap;font-size:9px;font-weight:700;color:#1e3a8a;background:rgba(255,255,255,0.92);padding:1px 5px;border-radius:4px;box-shadow:0 1px 4px rgba(0,0,0,0.2)">${label.slice(0, 18)}</span>` : '';
  return `<div style="position:relative;width:${px}px;height:${px}px;pointer-events:none" aria-label="Posto">
    <div style="width:${px}px;height:${px}px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:linear-gradient(180deg,#3b82f6,#1d4ed8);border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center">
      <svg width="${icon}" height="${icon}" viewBox="0 0 24 24" style="transform:rotate(45deg)" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M6 20V10l4-4h4v14" stroke="white" stroke-width="2" stroke-linejoin="round"/>
        <rect x="8" y="12" width="4" height="5" rx="0.5" fill="white"/>
        <path d="M14 6h2v4l2 2v8h-4V6z" stroke="white" stroke-width="1.8" stroke-linejoin="round"/>
        <circle cx="16" cy="18" r="1" fill="white"/>
      </svg>
    </div>
    ${name}
  </div>`;
}

/** Bandeira quadriculada no destino — estilo Waze (estilos inline). */
export function destinationMarkerHtml(): string {
  return `<div aria-label="Destino" style="position:relative;width:40px;height:52px;pointer-events:none;transform:translateY(2px)">
    <div style="position:absolute;left:50%;bottom:4px;width:3px;height:30px;transform:translateX(-50%);background:linear-gradient(180deg,#475569,#0f172a);border-radius:2px;box-shadow:0 1px 3px rgba(0,0,0,.45)"></div>
    <div style="position:absolute;left:50%;top:0;transform:translateX(-8%);line-height:0;filter:drop-shadow(0 2px 6px rgba(0,0,0,.5))">
      <svg width="30" height="24" viewBox="0 0 28 22" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect width="28" height="22" rx="2" fill="#0f172a"/>
        <g fill="#f8fafc">
          <rect x="2" y="2" width="5.5" height="5.5"/>
          <rect x="13.5" y="2" width="5.5" height="5.5"/>
          <rect x="8" y="8" width="5.5" height="5.5"/>
          <rect x="19.5" y="8" width="5.5" height="5.5"/>
          <rect x="2" y="14" width="5.5" height="5.5"/>
          <rect x="13.5" y="14" width="5.5" height="5.5"/>
        </g>
      </svg>
    </div>
    <div style="position:absolute;left:50%;bottom:0;width:16px;height:5px;transform:translateX(-50%);border-radius:50%;background:rgba(0,0,0,.38)"></div>
  </div>`;
}

