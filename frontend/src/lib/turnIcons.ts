/** Tipos de manobra para ícones estilo Waze (curvas realistas). */
export type ManeuverKind =
  | 'turn-left'
  | 'turn-right'
  | 'sharp-left'
  | 'sharp-right'
  | 'slight-left'
  | 'slight-right'
  | 'straight'
  | 'uturn'
  | 'roundabout-left'
  | 'roundabout-right'
  | 'roundabout'
  | 'exit-left'
  | 'exit-right'
  | 'merge'
  | 'arrive'
  | 'depart'
  | 'ferry'
  | 'unknown';

const STROKE = '#ffffff';
const ACCENT = '#38bdf8';

function arrowHead(
  x: number,
  y: number,
  dir: 'up' | 'left' | 'right' | 'down',
  size = 9
): string {
  const s = size;
  const base = `stroke="${STROKE}" stroke-width="5.5" fill="none" stroke-linecap="round" stroke-linejoin="round"`;
  if (dir === 'up') {
    return `<path d="M${x} ${y} L${x - s} ${y + s} M${x} ${y} L${x + s} ${y + s}" ${base}/>`;
  }
  if (dir === 'left') {
    return `<path d="M${x} ${y} L${x + s} ${y - s} M${x} ${y} L${x + s} ${y + s}" ${base}/>`;
  }
  if (dir === 'right') {
    return `<path d="M${x} ${y} L${x - s} ${y - s} M${x} ${y} L${x - s} ${y + s}" ${base}/>`;
  }
  return `<path d="M${x} ${y} L${x - s} ${y - s} M${x} ${y} L${x + s} ${y - s}" ${base}/>`;
}

const ICON_PATHS: Record<ManeuverKind, string> = {
  'turn-left': `
    <path d="M38 58 V34 Q38 16 20 16 H10" stroke="${STROKE}" stroke-width="5.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    ${arrowHead(10, 16, 'left', 10)}
  `,
  'turn-right': `
    <path d="M34 58 V34 Q34 16 52 16 H62" stroke="${STROKE}" stroke-width="5.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    ${arrowHead(62, 16, 'right', 10)}
  `,
  'sharp-left': `
    <path d="M40 58 V40 Q40 22 14 14 H8" stroke="${STROKE}" stroke-width="5.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    ${arrowHead(8, 14, 'left', 11)}
  `,
  'sharp-right': `
    <path d="M32 58 V40 Q32 22 58 14 H64" stroke="${STROKE}" stroke-width="5.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    ${arrowHead(64, 14, 'right', 11)}
  `,
  'slight-left': `
    <path d="M36 58 V28 L18 14" stroke="${STROKE}" stroke-width="5.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    ${arrowHead(18, 14, 'left', 9)}
  `,
  'slight-right': `
    <path d="M36 58 V28 L54 14" stroke="${STROKE}" stroke-width="5.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    ${arrowHead(54, 14, 'right', 9)}
  `,
  straight: `
    <path d="M36 58 V18" stroke="${STROKE}" stroke-width="5.5" fill="none" stroke-linecap="round"/>
    ${arrowHead(36, 18, 'up', 11)}
  `,
  uturn: `
    <path d="M48 58 V42 Q48 18 28 18 Q8 18 8 38 Q8 52 22 52" stroke="${STROKE}" stroke-width="5.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    ${arrowHead(22, 52, 'left', 10)}
  `,
  roundabout: `
    <circle cx="36" cy="34" r="16" stroke="${STROKE}" stroke-width="4.5" fill="none"/>
    <path d="M36 58 V50" stroke="${STROKE}" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M52 34 H60" stroke="${ACCENT}" stroke-width="5" fill="none" stroke-linecap="round"/>
    ${arrowHead(60, 34, 'right', 9)}
  `,
  'roundabout-left': `
    <circle cx="38" cy="34" r="15" stroke="${STROKE}" stroke-width="4.5" fill="none"/>
    <path d="M38 58 V49" stroke="${STROKE}" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M23 34 H12" stroke="${ACCENT}" stroke-width="5" fill="none" stroke-linecap="round"/>
    ${arrowHead(12, 34, 'left', 9)}
  `,
  'roundabout-right': `
    <circle cx="34" cy="34" r="15" stroke="${STROKE}" stroke-width="4.5" fill="none"/>
    <path d="M34 58 V49" stroke="${STROKE}" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M49 34 H60" stroke="${ACCENT}" stroke-width="5" fill="none" stroke-linecap="round"/>
    ${arrowHead(60, 34, 'right', 9)}
  `,
  'exit-left': `
    <path d="M36 58 V30 Q36 18 22 18 H12" stroke="${STROKE}" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    ${arrowHead(12, 18, 'left', 9)}
    <path d="M36 58 V42" stroke="${ACCENT}" stroke-width="4" fill="none" stroke-linecap="round" opacity="0.7"/>
  `,
  'exit-right': `
    <path d="M36 58 V30 Q36 18 50 18 H60" stroke="${STROKE}" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    ${arrowHead(60, 18, 'right', 9)}
    <path d="M36 58 V42" stroke="${ACCENT}" stroke-width="4" fill="none" stroke-linecap="round" opacity="0.7"/>
  `,
  merge: `
    <path d="M22 58 V32 L36 18" stroke="${STROKE}" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M50 58 V32 L36 18" stroke="${STROKE}" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    ${arrowHead(36, 18, 'up', 10)}
  `,
  arrive: `
    <circle cx="36" cy="28" r="10" stroke="${ACCENT}" stroke-width="4" fill="none"/>
    <path d="M36 38 V56" stroke="${STROKE}" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M28 56 H44" stroke="${STROKE}" stroke-width="5" fill="none" stroke-linecap="round"/>
  `,
  depart: `
    <circle cx="36" cy="50" r="7" fill="${ACCENT}"/>
    <path d="M36 43 V16" stroke="${STROKE}" stroke-width="5" fill="none" stroke-linecap="round"/>
    ${arrowHead(36, 16, 'up', 10)}
  `,
  ferry: `
    <path d="M14 46 H58 L52 34 H20 Z" stroke="${STROKE}" stroke-width="4" fill="none" stroke-linejoin="round"/>
    <path d="M36 34 V18" stroke="${STROKE}" stroke-width="4" fill="none" stroke-linecap="round"/>
    ${arrowHead(36, 18, 'up', 8)}
  `,
  unknown: `
    <path d="M36 58 V18" stroke="${STROKE}" stroke-width="5.5" fill="none" stroke-linecap="round"/>
    ${arrowHead(36, 18, 'up', 11)}
  `,
};

export function parseManeuverKind(instructionType?: string, message?: string): ManeuverKind {
  const type = (instructionType ?? '').toUpperCase().replace(/-/g, '_').replace(/\s+/g, '_');
  const msg = (message ?? '').toLowerCase();

  const fromType: Record<string, ManeuverKind> = {
    TURN_LEFT: 'turn-left',
    TURN_SHARP_LEFT: 'sharp-left',
    TURN_SLIGHT_LEFT: 'slight-left',
    SHARP_LEFT: 'sharp-left',
    SLIGHT_LEFT: 'slight-left',
    BEAR_LEFT: 'slight-left',
    KEEP_LEFT: 'slight-left',
    WAYPOINT_LEFT: 'slight-left',
    ARRIVE_LEFT: 'arrive',
    TURN_RIGHT: 'turn-right',
    TURN_SHARP_RIGHT: 'sharp-right',
    TURN_SLIGHT_RIGHT: 'slight-right',
    SHARP_RIGHT: 'sharp-right',
    SLIGHT_RIGHT: 'slight-right',
    BEAR_RIGHT: 'slight-right',
    KEEP_RIGHT: 'slight-right',
    WAYPOINT_RIGHT: 'slight-right',
    ARRIVE_RIGHT: 'arrive',
    TURN: 'straight',
    STRAIGHT: 'straight',
    FOLLOW: 'straight',
    DEPART: 'depart',
    ARRIVE: 'arrive',
    WAYPOINT_REACHED: 'arrive',
    MAKE_UTURN: 'uturn',
    TRY_MAKE_UTURN: 'uturn',
    ROUNDABOUT_LEFT: 'roundabout-left',
    ROUNDABOUT_RIGHT: 'roundabout-right',
    ROUNDABOUT_CROSS: 'roundabout',
    ROUNDABOUT_BACK: 'uturn',
    MOTORWAY_EXIT_LEFT: 'exit-left',
    TAKE_EXIT: 'exit-right',
    MOTORWAY_EXIT_RIGHT: 'exit-right',
    ENTRANCE_RAMP: 'merge',
    ENTER_MOTORWAY: 'merge',
    ENTER_FREEWAY: 'merge',
    ENTER_HIGHWAY: 'merge',
    SWITCH_PARALLEL_ROAD: 'merge',
    SWITCH_MAIN_ROAD: 'merge',
    TAKE_FERRY: 'ferry',
  };

  if (type && fromType[type]) return fromType[type];

  if (/rotat|retorn|roundabout/.test(msg)) {
    if (/esquerda|à esquerda/.test(msg)) return 'roundabout-left';
    if (/direita|à direita/.test(msg)) return 'roundabout-right';
    return 'roundabout';
  }
  if (/retorno|retorne|u-turn|u turn|faça retorno/.test(msg)) return 'uturn';
  if (/acentuad|fechad|sharp/.test(msg) && /esquerda/.test(msg)) return 'sharp-left';
  if (/acentuad|fechad|sharp/.test(msg) && /direita/.test(msg)) return 'sharp-right';
  if (/vire|virar|curve|curva|dobre/.test(msg) && /esquerda/.test(msg)) return 'turn-left';
  if (/vire|virar|curve|curva|dobre/.test(msg) && /direita/.test(msg)) return 'turn-right';
  if (/mantenha|permaneça|continue|siga/.test(msg) && /esquerda/.test(msg)) return 'slight-left';
  if (/mantenha|permaneça|continue|siga/.test(msg) && /direita/.test(msg)) return 'slight-right';
  if (/saída|pegue a saída/.test(msg) && /esquerda/.test(msg)) return 'exit-left';
  if (/saída|pegue a saída/.test(msg)) return 'exit-right';
  if (/cheg|destino|você chegou/.test(msg)) return 'arrive';
  if (/embarque|balsa|ferry/.test(msg)) return 'ferry';
  if (/siga em frente|continue em frente|reto|segue/.test(msg)) return 'straight';

  if (/esquerda/.test(msg)) return 'turn-left';
  if (/direita/.test(msg)) return 'turn-right';
  return 'straight';
}

export function maneuverLabel(kind: ManeuverKind): string {
  const labels: Record<ManeuverKind, string> = {
    'turn-left': 'Vire à esquerda',
    'turn-right': 'Vire à direita',
    'sharp-left': 'Curva fechada à esquerda',
    'sharp-right': 'Curva fechada à direita',
    'slight-left': 'Mantenha à esquerda',
    'slight-right': 'Mantenha à direita',
    straight: 'Siga em frente',
    uturn: 'Retorno',
    roundabout: 'Rotatória',
    'roundabout-left': 'Rotatória — saída à esquerda',
    'roundabout-right': 'Rotatória — saída à direita',
    'exit-left': 'Saída à esquerda',
    'exit-right': 'Saída à direita',
    merge: 'Entre na via',
    arrive: 'Chegada',
    depart: 'Início',
    ferry: 'Balsa',
    unknown: 'Continue',
  };
  return labels[kind];
}

export function turnIconSvg(kind: ManeuverKind, px = 72): string {
  const paths = ICON_PATHS[kind] ?? ICON_PATHS.unknown;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 72 72" aria-hidden="true">${paths}</svg>`;
}

/** Ícone grande no banner superior (HUD). */
export function turnBannerHtml(instructionType?: string, message?: string): string {
  const kind = parseManeuverKind(instructionType, message);
  return `<div class="wz-turn-banner" aria-hidden="true">${turnIconSvg(kind, 76)}</div>`;
}

/** Ícone grande no mapa, na manobra seguinte. */
export function turnMapMarkerHtml(instructionType?: string, message?: string): string {
  const kind = parseManeuverKind(instructionType, message);
  return `<div class="wz-turn-map" aria-hidden="true">
    <div class="wz-turn-map-bg"></div>
    ${turnIconSvg(kind, 56)}
  </div>`;
}
