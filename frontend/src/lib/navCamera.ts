import { destinationPoint } from '../utils/geo';

/** Visão Waze com contexto — enxergar a curva à frente (print 2), não colado na linha (print 1). */
export const NAV_PITCH = 55;
export const NAV_PITCH_MOBILE = 48;
export const ZOOM_NAV_FLAT = 16;
export const ZOOM_NAV_MAX = 17.5;
/** Zoom mínimo aceitável em navegação (abaixo disso força recâmera). */
export const ZOOM_NAV_MIN_ACTIVE = 15;

export function isMobileViewport(): boolean {
  return typeof window !== 'undefined' && window.innerWidth < 768;
}

/** Zoom com pitch 3D — moderado para ver ruas e a próxima manobra. */
export function navTargetZoom(pitch: number): number {
  const flat = isMobileViewport() ? ZOOM_NAV_FLAT : 16.5;
  if (pitch <= 0) return flat;
  return Math.min(ZOOM_NAV_MAX, flat + pitch * 0.014);
}

/** Desloca centro à frente do carro para mostrar a curva seguinte. */
export function navCameraCenter(
  lat: number,
  lon: number,
  bearing: number,
  pitch = 0
): { lat: number; lon: number } {
  const mobile = isMobileViewport();
  let forwardKm = mobile ? 0.055 : 0.07;
  if (pitch > 35) forwardKm += mobile ? 0.018 : 0.022;
  return destinationPoint(lat, lon, bearing, forwardKm);
}

/** Padding empurra o ícone do veículo para baixo (HUD Waze). */
export function navCameraPadding(): { top: number; bottom: number; left: number; right: number } {
  const mobile = isMobileViewport();
  return {
    top: mobile ? 118 : 88,
    bottom: mobile ? 210 : 150,
    left: mobile ? 28 : 36,
    right: mobile ? 28 : 36,
  };
}

export function navPitchForViewport(): number {
  return isMobileViewport() ? NAV_PITCH_MOBILE : NAV_PITCH;
}
