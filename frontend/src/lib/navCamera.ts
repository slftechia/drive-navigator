import { destinationPoint } from '../utils/geo';

/** Visão Waze — pitch 3D com o carro sempre visível na parte inferior. */
export const NAV_PITCH = 62;
export const NAV_PITCH_MOBILE = 55;
export const ZOOM_NAV_FLAT = 16.5;
export const ZOOM_NAV_MAX = 18.0;
export const ZOOM_NAV_MIN_ACTIVE = 15.2;
export const NAV_MAP_MIN_ZOOM = 12;
export const NAV_MAP_MAX_ZOOM = 22;
export const NAV_ZOOM_MANUAL_DELTA = 0.55;

export function isMobileViewport(): boolean {
  return typeof window !== 'undefined' && window.innerWidth < 768;
}

export function navTargetZoom(pitch: number): number {
  const flat = isMobileViewport() ? ZOOM_NAV_FLAT : 16.9;
  if (pitch <= 0) return flat;
  return Math.min(ZOOM_NAV_MAX, flat + pitch * 0.02);
}

/** Menos “lookahead” para o ícone do carro não sumir embaixo do HUD. */
export function navCameraCenter(
  lat: number,
  lon: number,
  bearing: number,
  pitch = 0
): { lat: number; lon: number } {
  const mobile = isMobileViewport();
  let forwardKm = mobile ? 0.045 : 0.06;
  if (pitch > 35) forwardKm += mobile ? 0.02 : 0.025;
  return destinationPoint(lat, lon, bearing, forwardKm);
}

export function navCameraPadding(): { top: number; bottom: number; left: number; right: number } {
  const mobile = isMobileViewport();
  return {
    top: mobile ? 120 : 90,
    bottom: mobile ? 190 : 140,
    left: mobile ? 24 : 32,
    right: mobile ? 24 : 32,
  };
}

export function navPitchForViewport(): number {
  return isMobileViewport() ? NAV_PITCH_MOBILE : NAV_PITCH;
}
