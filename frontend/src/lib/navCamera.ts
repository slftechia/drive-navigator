import { destinationPoint } from '../utils/geo';

/** Configuração de câmera de navegação (calibrada estilo Waze — valores originais do projeto). */
export const NAV_PITCH = 60;
export const NAV_PITCH_MOBILE = 50;
export const ZOOM_NAV_FLAT = 17.5;
export const ZOOM_NAV_MAX = 20;
/** Abaixo disso a câmera de navegação é forçada de volta (ex.: zoom preso na prévia ~12). */
export const ZOOM_NAV_MIN_ACTIVE = 17;

export function isMobileViewport(): boolean {
  return typeof window !== 'undefined' && window.innerWidth < 768;
}

/** Com inclinação 3D o mapa mostra mais área — compensa levemente o zoom. */
export function navTargetZoom(pitch: number): number {
  const flat = isMobileViewport() ? ZOOM_NAV_FLAT : 17;
  if (pitch <= 0) return flat;
  return Math.min(
    ZOOM_NAV_MAX,
    flat + pitch * 0.038 + (isMobileViewport() ? 0.6 : 0.3)
  );
}

/** Desloca centro à frente do carro — carro fica na parte inferior da tela. */
export function navCameraCenter(
  lat: number,
  lon: number,
  bearing: number,
  pitch = 0
): { lat: number; lon: number } {
  const mobile = isMobileViewport();
  let forwardKm = mobile ? 0.048 : 0.062;
  if (pitch > 35) forwardKm += mobile ? 0.012 : 0.01;
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
