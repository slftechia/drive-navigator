/**
 * Ícones de manobra estilo Waze: setas brancas grossas (banner + mapa).
 */
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

const W = '#ffffff';

const ICON_PATHS: Record<ManeuverKind, string> = {
  'turn-right': `<path fill="${W}" d="M26 64 L26 34 C26 22 34 16 46 16 L52 16 L52 6 L70 24 L52 42 L52 30 L48 30 C38 30 36 34 36 40 L36 64 Z"/>`,
  'turn-left': `<path fill="${W}" d="M46 64 L46 34 C46 22 38 16 26 16 L20 16 L20 6 L2 24 L20 42 L20 30 L24 30 C34 30 36 34 36 40 L36 64 Z"/>`,
  'sharp-right': `<path fill="${W}" d="M26 64 L26 38 C26 26 34 18 50 12 L54 10 L54 2 L70 22 L52 38 L52 26 C40 30 36 36 36 44 L36 64 Z"/>`,
  'sharp-left': `<path fill="${W}" d="M46 64 L46 38 C46 26 38 18 22 12 L18 10 L18 2 L2 22 L20 38 L20 26 C32 30 36 36 36 44 L36 64 Z"/>`,
  'slight-right': `<path fill="${W}" d="M28 64 L28 34 L44 14 L52 8 L48 0 L68 14 L54 34 L48 28 L38 40 L38 64 Z"/>`,
  'slight-left': `<path fill="${W}" d="M44 64 L44 34 L28 14 L20 8 L24 0 L4 14 L18 34 L24 28 L34 40 L34 64 Z"/>`,
  straight: `<path fill="${W}" d="M28 64 L28 28 L14 28 L36 4 L58 28 L44 28 L44 64 Z"/>`,
  uturn: `<path fill="${W}" d="M48 64 L48 34 C48 16 36 8 24 8 C12 8 2 16 2 32 C2 46 12 52 22 52 L22 38 C16 38 14 34 14 30 C14 24 18 18 24 18 C30 18 36 24 36 32 L36 64 Z"/>`,
  roundabout: `<circle cx="36" cy="30" r="15" fill="none" stroke="${W}" stroke-width="8"/><path fill="${W}" d="M30 64 L30 48 L42 48 L42 64 Z"/><path fill="${W}" d="M48 24 L60 30 L48 36 Z"/>`,
  'roundabout-left': `<circle cx="38" cy="30" r="14" fill="none" stroke="${W}" stroke-width="8"/><path fill="${W}" d="M32 64 L32 48 L44 48 L44 64 Z"/><path fill="${W}" d="M28 24 L12 30 L28 36 Z"/>`,
  'roundabout-right': `<circle cx="34" cy="30" r="14" fill="none" stroke="${W}" stroke-width="8"/><path fill="${W}" d="M28 64 L28 48 L40 48 L40 64 Z"/><path fill="${W}" d="M44 24 L60 30 L44 36 Z"/>`,
  'exit-right': `<path fill="${W}" d="M26 64 L26 34 C26 22 34 16 46 16 L52 16 L52 6 L70 24 L52 42 L52 30 L48 30 C38 30 36 34 36 40 L36 64 Z"/>`,
  'exit-left': `<path fill="${W}" d="M46 64 L46 34 C46 22 38 16 26 16 L20 16 L20 6 L2 24 L20 42 L20 30 L24 30 C34 30 36 34 36 40 L36 64 Z"/>`,
  merge: `<path fill="${W}" d="M16 64 L16 38 L30 18 L36 10 L28 10 L36 0 L54 22 L46 22 L36 36 L36 64 Z"/>`,
  arrive: `<circle cx="36" cy="24" r="13" fill="none" stroke="${W}" stroke-width="7"/><path fill="${W}" d="M30 40 L30 64 L42 64 L42 40 Z"/>`,
  depart: `<circle cx="36" cy="52" r="9" fill="${W}"/><path fill="${W}" d="M28 40 L28 24 L14 24 L36 2 L58 24 L44 24 L44 40 Z"/>`,
  ferry: `<path fill="${W}" d="M12 50 L60 50 L52 34 L20 34 Z"/><path fill="${W}" d="M28 34 L28 18 L14 18 L36 2 L58 18 L44 18 L44 34 Z"/>`,
  unknown: `<path fill="${W}" d="M28 64 L28 28 L14 28 L36 4 L58 28 L44 28 L44 64 Z"/>`,
};

export function parseManeuverKind(instructionType?: string, message?: string): ManeuverKind {
  const type = (instructionType ?? '').toUpperCase().replace(/-/g, '_').replace(/\s+/g, '_');
  const msg = (message ?? '').toLowerCase();
  const fromType: Record<string, ManeuverKind> = {
    TURN_LEFT: 'turn-left', TURN_SHARP_LEFT: 'sharp-left', TURN_SLIGHT_LEFT: 'slight-left',
    SHARP_LEFT: 'sharp-left', SLIGHT_LEFT: 'slight-left', BEAR_LEFT: 'slight-left', KEEP_LEFT: 'slight-left',
    WAYPOINT_LEFT: 'slight-left', ARRIVE_LEFT: 'arrive', TURN_RIGHT: 'turn-right',
    TURN_SHARP_RIGHT: 'sharp-right', TURN_SLIGHT_RIGHT: 'slight-right', SHARP_RIGHT: 'sharp-right',
    SLIGHT_RIGHT: 'slight-right', BEAR_RIGHT: 'slight-right', KEEP_RIGHT: 'slight-right',
    WAYPOINT_RIGHT: 'slight-right', ARRIVE_RIGHT: 'arrive', TURN: 'straight', STRAIGHT: 'straight',
    FOLLOW: 'straight', DEPART: 'depart', ARRIVE: 'arrive', WAYPOINT_REACHED: 'arrive',
    MAKE_UTURN: 'uturn', TRY_MAKE_UTURN: 'uturn', ROUNDABOUT_LEFT: 'roundabout-left',
    ROUNDABOUT_RIGHT: 'roundabout-right', ROUNDABOUT_CROSS: 'roundabout', ROUNDABOUT_BACK: 'uturn',
    MOTORWAY_EXIT_LEFT: 'exit-left', TAKE_EXIT: 'exit-right', MOTORWAY_EXIT_RIGHT: 'exit-right',
    ENTRANCE_RAMP: 'merge', ENTER_MOTORWAY: 'merge', ENTER_FREEWAY: 'merge', ENTER_HIGHWAY: 'merge',
    SWITCH_PARALLEL_ROAD: 'merge', SWITCH_MAIN_ROAD: 'merge', TAKE_FERRY: 'ferry',
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
    'turn-left': 'Vire à esquerda', 'turn-right': 'Vire à direita',
    'sharp-left': 'Curva fechada à esquerda', 'sharp-right': 'Curva fechada à direita',
    'slight-left': 'Mantenha à esquerda', 'slight-right': 'Mantenha à direita',
    straight: 'Siga em frente', uturn: 'Retorno', roundabout: 'Rotatória',
    'roundabout-left': 'Rotatória — saída à esquerda', 'roundabout-right': 'Rotatória — saída à direita',
    'exit-left': 'Saída à esquerda', 'exit-right': 'Saída à direita', merge: 'Entre na via',
    arrive: 'Chegada', depart: 'Início', ferry: 'Balsa', unknown: 'Continue',
  };
  return labels[kind];
}

export function turnIconSvg(kind: ManeuverKind, px = 72): string {
  const paths = ICON_PATHS[kind] ?? ICON_PATHS.unknown;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 72 72" aria-hidden="true">${paths}</svg>`;
}

export function turnBannerHtml(instructionType?: string, message?: string): string {
  const kind = parseManeuverKind(instructionType, message);
  return `<div class="wz-turn-banner" aria-hidden="true" style="filter:drop-shadow(0 2px 4px rgba(0,0,0,.45))">${turnIconSvg(kind, 78)}</div>`;
}

export function turnThenHtml(instructionType?: string, message?: string): string {
  const kind = parseManeuverKind(instructionType, message);
  return `<div class="wz-turn-then" aria-hidden="true">${turnIconSvg(kind, 24)}</div>`;
}

const ROUTE_TURN_PATHS: Partial<Record<ManeuverKind, string>> = {
  'turn-right': `<path fill="#fff" stroke="#0f172a" stroke-width="3" stroke-linejoin="round" d="M28 64 L28 30 C28 20 34 16 44 16 L50 16 L50 8 L68 24 L50 40 L50 28 L46 28 C38 28 36 32 36 38 L36 64 Z"/>`,
  'turn-left': `<path fill="#fff" stroke="#0f172a" stroke-width="3" stroke-linejoin="round" d="M44 64 L44 30 C44 20 38 16 28 16 L22 16 L22 8 L4 24 L22 40 L22 28 L26 28 C34 28 36 32 36 38 L36 64 Z"/>`,
  'sharp-right': `<path fill="#fff" stroke="#0f172a" stroke-width="3" stroke-linejoin="round" d="M28 64 L28 36 C28 24 36 16 50 10 L54 8 L54 2 L68 22 L52 38 L52 26 C40 30 36 36 36 44 L36 64 Z"/>`,
  'sharp-left': `<path fill="#fff" stroke="#0f172a" stroke-width="3" stroke-linejoin="round" d="M44 64 L44 36 C44 24 36 16 22 10 L18 8 L18 2 L4 22 L20 38 L20 26 C32 30 36 36 36 44 L36 64 Z"/>`,
  'slight-right': `<path fill="#fff" stroke="#0f172a" stroke-width="3" stroke-linejoin="round" d="M30 64 L30 34 L44 14 L52 8 L48 0 L68 14 L54 34 L48 28 L38 40 L38 64 Z"/>`,
  'slight-left': `<path fill="#fff" stroke="#0f172a" stroke-width="3" stroke-linejoin="round" d="M42 64 L42 34 L28 14 L20 8 L24 0 L4 14 L18 34 L24 28 L34 40 L34 64 Z"/>`,
  straight: `<path fill="#fff" stroke="#0f172a" stroke-width="3" stroke-linejoin="round" d="M28 64 L28 28 L16 28 L36 6 L56 28 L44 28 L44 64 Z"/>`,
  uturn: `<path fill="#fff" stroke="#0f172a" stroke-width="3" stroke-linejoin="round" d="M46 64 L46 34 C46 16 34 8 22 8 C10 8 2 16 2 30 C2 44 10 50 20 50 L20 38 C14 38 12 34 12 30 C12 24 16 18 22 18 C28 18 34 24 34 32 L34 64 Z"/>`,
};

/** Seta Waze SOBRE a rota: branca + contorno escuro, SEM círculo. */
export function turnMapMarkerHtml(instructionType?: string, message?: string): string {
  const kind = parseManeuverKind(instructionType, message);
  const body = ROUTE_TURN_PATHS[kind] ?? ROUTE_TURN_PATHS['turn-right'];
  return `<div aria-hidden="true" style="width:80px;height:80px;pointer-events:none;line-height:0"><svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 72 72" style="display:block;filter:drop-shadow(0 2px 3px rgba(0,0,0,.55))">${body}</svg></div>`;
}
