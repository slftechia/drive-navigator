import type { RoadAlert } from '../api';
import {
  ALL_ALERT_TYPES,
  alertTypeSpeak,
  type RoadAlertType,
} from './alertTypes';
import { filterMapAlerts, alertRouteProgressKm } from './roadAlerts';
import { getVoicePersona, pickSystemVoiceForPersona } from './voicePersonas';
import { haversineKm, routeProgressKm } from '../utils/geo';

export type AlertTypeToggles = Record<RoadAlertType, boolean>;

export interface AlertSoundSettings {
  master: boolean;
  muted: boolean;
  /** Preferências por tipo de alerta (som). */
  types: AlertTypeToggles;
  voice: boolean;
  navGuidance: boolean;
  /** Persona: alessandra, joao, etc. */
  personaId: string;
  voiceRate: number;
  /** Legacy — ignorado se personaId existir. */
  voiceURI?: string | null;
  radar?: boolean;
  lombada?: boolean;
  perigo?: boolean;
}

export interface VoiceOption {
  uri: string;
  label: string;
  lang: string;
}

const STORAGE_KEY = 'drive-nav-alert-sounds';

function defaultTypeToggles(): AlertTypeToggles {
  const o = {} as AlertTypeToggles;
  for (const t of ALL_ALERT_TYPES) o[t] = true;
  return o;
}

export const DEFAULT_ALERT_SOUND_SETTINGS: AlertSoundSettings = {
  master: true,
  muted: false,
  types: defaultTypeToggles(),
  voice: true,
  navGuidance: true,
  personaId: 'alessandra',
  voiceRate: 1.05,
};

function migrateTypes(parsed: Partial<AlertSoundSettings>): AlertTypeToggles {
  const base = defaultTypeToggles();
  if (parsed.types && typeof parsed.types === 'object') {
    for (const t of ALL_ALERT_TYPES) {
      if (typeof parsed.types[t] === 'boolean') base[t] = parsed.types[t];
    }
  }
  // legado
  if (typeof parsed.radar === 'boolean') base.radar = parsed.radar;
  if (typeof parsed.lombada === 'boolean') base.lombada = parsed.lombada;
  if (typeof parsed.perigo === 'boolean') base.perigo = parsed.perigo;
  return base;
}

export function loadAlertSoundSettings(): AlertSoundSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {
      ...DEFAULT_ALERT_SOUND_SETTINGS,
      types: defaultTypeToggles(),
    };
    const parsed = JSON.parse(raw) as Partial<AlertSoundSettings>;
    return {
      master: parsed.master ?? true,
      muted: parsed.muted ?? false,
      types: migrateTypes(parsed),
      voice: parsed.voice ?? true,
      navGuidance: parsed.navGuidance ?? true,
      personaId: parsed.personaId || 'alessandra',
      voiceRate:
        typeof parsed.voiceRate === 'number' && parsed.voiceRate >= 0.7 && parsed.voiceRate <= 1.4
          ? parsed.voiceRate
          : 1.05,
    };
  } catch {
    return { ...DEFAULT_ALERT_SOUND_SETTINGS, types: defaultTypeToggles() };
  }
}

export function saveAlertSoundSettings(settings: AlertSoundSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function isAlertSoundEnabled(settings: AlertSoundSettings, type: RoadAlert['type']): boolean {
  if (settings.muted || !settings.master) return false;
  return settings.types?.[type as RoadAlertType] ?? true;
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
  if (loadAlertSoundSettings().muted) return;
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

export function playGenericAlertSound(): void {
  tone(780, 0.16, 0.28);
  setTimeout(() => tone(920, 0.2, 0.24), 180);
}

export function playArrivalSound(): void {
  tone(880, 0.2, 0.28);
  setTimeout(() => tone(1100, 0.28, 0.32), 220);
  setTimeout(() => tone(1320, 0.35, 0.26), 480);
}

export function unlockAlertAudio(): void {
  getAudioContext();
}

export function listAvailableVoices(): VoiceOption[] {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
  try {
    const all = window.speechSynthesis.getVoices();
    const pt = all.filter((v) => /^pt/i.test(v.lang));
    const pool = pt.length ? pt : all.slice(0, 12);
    return pool.map((v) => ({
      uri: v.voiceURI,
      label: `${v.name} (${v.lang})`,
      lang: v.lang,
    }));
  } catch {
    return [];
  }
}

export function speakNavigation(text: string, settingsOverride?: AlertSoundSettings): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  const settings = settingsOverride ?? loadAlertSoundSettings();
  if (settings.muted) return;
  try {
    window.speechSynthesis.cancel();
    const persona = getVoicePersona(settings.personaId);
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'pt-BR';
    utterance.rate = (settings.voiceRate || 1.05) * (persona.rate / 1.05);
    utterance.pitch = persona.pitch;
    utterance.volume = 0.95;
    const voice = pickSystemVoiceForPersona(persona);
    if (voice) utterance.voice = voice;
    window.speechSynthesis.speak(utterance);
  } catch {
    /* ignore */
  }
}

/** Testa uma persona pelo id. */
export function testVoicePersona(personaId: string, sample?: string): void {
  const settings = { ...loadAlertSoundSettings(), muted: false, personaId };
  const persona = getVoicePersona(personaId);
  speakNavigation(sample ?? persona.sample, settings);
}

const ALERT_SOUND_THRESHOLDS_M = [350, 120] as const;

export type AnnouncedMap = Map<string, Set<number>>;

function isAlertAheadOnRoute(
  alert: RoadAlert,
  lat: number,
  lon: number,
  routePoints: Array<{ lat: number; lon: number }>
): boolean {
  const userKm = routeProgressKm({ lat, lon }, routePoints);
  const alertKm = alertRouteProgressKm(alert, routePoints);
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
  if (settings.muted || !settings.master || !alerts?.length) return;

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

      if (alert.type === 'radar') playRadarAlertSound();
      else if (alert.type === 'lombada') playLombadaAlertSound();
      else playGenericAlertSound();

      if (threshold <= 120 && settings.voice) {
        speakNavigation(alertTypeSpeak(alert.type), settings);
      }
      break;
    }
  }
}

export function resetAnnouncedAlerts(announced: AnnouncedMap): void {
  announced.clear();
}
