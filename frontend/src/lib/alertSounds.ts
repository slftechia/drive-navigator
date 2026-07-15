import type { RoadAlert } from '../api';
import { filterMapAlerts } from './roadAlerts';
import { haversineKm, routeProgressKm } from '../utils/geo';

export interface AlertSoundSettings {
  master: boolean;
  radar: boolean;
  lombada: boolean;
  voice: boolean;
  /** Voz das manobras (turn-by-turn) durante a navegação. */
  navGuidance: boolean;
}

const STORAGE_KEY = 'drive-nav-alert-sounds';

export const DEFAULT_ALERT_SOUND_SETTINGS: AlertSoundSettings = {
  master: true,
  radar: true,
  lombada: true,
  voice: true,
  navGuidance: true,
};

export function loadAlertSoundSettings(): AlertSoundSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_ALERT_SOUND_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AlertSoundSettings>;
    return {
      master: parsed.master ?? true,
      radar: parsed.radar ?? true,
      lombada: parsed.lombada ?? true,
      voice: parsed.voice ?? true,
      navGuidance: parsed.navGuidance ?? true,
    };
  } catch {
    return { ...DEFAULT_ALERT_SOUND_SETTINGS };
  }
}

export function saveAlertSoundSettings(settings: AlertSoundSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function isAlertSoundEnabled(settings: AlertSoundSettings, type: RoadAlert['type']): boolean {
  if (!settings.master) return false;
  if (type === 'radar') return settings.radar;
  if (type === 'lombada') return settings.lombada;
  return false;
}

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    try {
      audioCtx = new AudioContext();
    } catch {
      return null;
    }
  }
  if (audioCtx.state === 'suspended') {
    void audioCtx.resume();
  }
  return audioCtx;
}

function tone(freq: number, durationSec: number, volume = 0.25): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.value = volume;
  osc.connect(gain);
  gain.connect(ctx.destination);
  const t = ctx.currentTime;
  osc.start(t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + durationSec);
  osc.stop(t + durationSec);
}

export function playRadarAlertSound(): void {
  tone(1040, 0.18, 0.3);
  setTimeout(() => tone(1240, 0.12, 0.22), 200);
}

export function playLombadaAlertSound(): void {
  tone(620, 0.22, 0.32);
  setTimeout(() => tone(520, 0.18, 0.28), 240);
}

export function playArrivalSound(): void {
  tone(880, 0.2, 0.28);
  setTimeout(() => tone(1100, 0.28, 0.32), 220);
  setTimeout(() => tone(1320, 0.35, 0.26), 480);
}

/** Desbloqueia áudio após gesto do usuário (necessário no mobile). */
export function unlockAlertAudio(): void {
  getAudioContext();
}

export function speakNavigation(text: string): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'pt-BR';
    utterance.rate = 1.05;
    utterance.volume = 0.95;
    window.speechSynthesis.speak(utterance);
  } catch {
    /* ignore */
  }
}

const ALERT_SOUND_THRESHOLDS_M = [350, 120] as const;

/** Evita repetir o mesmo alerta no mesmo limiar. */
export type AnnouncedMap = Map<string, Set<number>>;

function isAlertAheadOnRoute(
  alert: RoadAlert,
  lat: number,
  lon: number,
  routePoints: Array<{ lat: number; lon: number }>
): boolean {
  const userKm = routeProgressKm({ lat, lon }, routePoints);
  const alertKm = routeProgressKm(alert, routePoints);
  return alertKm >= userKm - 0.04 && alertKm <= userKm + 2.5;
}

export function checkRoadAlertSounds(
  lat: number,
  lon: number,
  alerts: RoadAlert[] | undefined,
  settings: AlertSoundSettings,
  announced: AnnouncedMap,
  routePoints?: Array<{ lat: number; lon: number }>
): void {
  if (!settings.master || !alerts?.length) return;

  for (const alert of filterMapAlerts(alerts)) {
    if (!isAlertSoundEnabled(settings, alert.type)) continue;
    if (routePoints && routePoints.length >= 2 && !isAlertAheadOnRoute(alert, lat, lon, routePoints)) {
      continue;
    }

    const distM = haversineKm(lat, lon, alert.lat, alert.lon) * 1000;
    for (const threshold of ALERT_SOUND_THRESHOLDS_M) {
      if (distM > threshold) continue;
      let buckets = announced.get(alert.id);
      if (!buckets) {
        buckets = new Set();
        announced.set(alert.id, buckets);
      }
      if (buckets.has(threshold)) continue;
      buckets.add(threshold);
      if (alert.type === 'radar') {
        playRadarAlertSound();
        if (threshold <= 120 && settings.voice) speakNavigation('Radar à frente');
      } else if (alert.type === 'lombada') {
        playLombadaAlertSound();
        if (threshold <= 120 && settings.voice) speakNavigation('Lombada à frente');
      }
      break;
    }
  }
}

export function resetAnnouncedAlerts(announced: AnnouncedMap): void {
  announced.clear();
}
