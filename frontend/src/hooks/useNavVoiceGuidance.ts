import { useEffect, useRef } from 'react';
import type { RouteInstruction } from '../api';
import { speakNavigation } from '../lib/alertSounds';
import { parseManeuverKind, maneuverLabel } from '../lib/turnIcons';
import { haversineKm } from '../utils/geo';

/** Limiares em metros: anuncia ao cruzar cada um (estilo Waze). */
const VOICE_THRESHOLDS_M = [700, 280, 90] as const;

function stripHtml(message?: string): string {
  return message?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() ?? '';
}

function streetFromMessage(message: string): string {
  const m =
    message.match(/\bem\s+(.+)$/i) ||
    message.match(/\bna\s+(.+)$/i) ||
    message.match(/\bno\s+(.+)$/i) ||
    message.match(/\bpara\s+(.+)$/i);
  return (m?.[1] ?? '').replace(/\.$/, '').trim();
}

function formatDistanceVoice(meters: number): string {
  if (meters >= 950) {
    const km = Math.round(meters / 100) / 10;
    if (km === 1) return '1 quilômetro';
    const label = Number.isInteger(km) ? String(km) : String(km).replace('.', ',');
    return `${label} quilômetros`;
  }
  const rounded = meters >= 100 ? Math.round(meters / 50) * 50 : Math.max(20, Math.round(meters / 10) * 10);
  return `${rounded} metros`;
}

function instructionKey(inst: RouteInstruction): string {
  return `${inst.lat.toFixed(5)},${inst.lon.toFixed(5)},${inst.instructionType ?? ''},${stripHtml(inst.message).slice(0, 40)}`;
}

function buildPhrase(inst: RouteInstruction, distanceM: number, near: boolean): string | null {
  const kind = parseManeuverKind(inst.instructionType, inst.message);
  if (kind === 'arrive' || kind === 'depart') return null;
  // Evita spam de "siga em frente" longe.
  if (kind === 'straight' && distanceM > 200) return null;

  const action = maneuverLabel(kind);
  const street = streetFromMessage(stripHtml(inst.message));
  const actionLc = action.charAt(0).toLowerCase() + action.slice(1);

  if (near) {
    return street ? `${action}. ${street}` : action;
  }

  const dist = formatDistanceVoice(distanceM);
  if (street) return `Em ${dist}, ${actionLc} em ${street}`;
  return `Em ${dist}, ${actionLc}`;
}

interface UseNavVoiceGuidanceOptions {
  active: boolean;
  enabled: boolean;
  instruction: RouteInstruction | null;
  userLat: number;
  userLon: number;
  navigationStartToken: number;
}

export function useNavVoiceGuidance({
  active,
  enabled,
  instruction,
  userLat,
  userLon,
  navigationStartToken,
}: UseNavVoiceGuidanceOptions): void {
  const announcedRef = useRef<Map<string, Set<number>>>(new Map());
  const startedTokenRef = useRef(-1);

  useEffect(() => {
    if (!active) {
      announcedRef.current.clear();
      return;
    }
    if (startedTokenRef.current !== navigationStartToken) {
      startedTokenRef.current = navigationStartToken;
      announcedRef.current.clear();
      if (enabled) {
        // Pequeno delay: deixa o áudio desbloquear após o gesto "Ir agora".
        const t = window.setTimeout(() => speakNavigation('Navegação iniciada'), 400);
        return () => window.clearTimeout(t);
      }
    }
  }, [active, enabled, navigationStartToken]);

  useEffect(() => {
    if (!active || !enabled || !instruction) return;

    const kind = parseManeuverKind(instruction.instructionType, instruction.message);
    if (kind === 'arrive') return;

    const distM = haversineKm(userLat, userLon, instruction.lat, instruction.lon) * 1000;
    const key = instructionKey(instruction);
    let announced = announcedRef.current.get(key);
    if (!announced) {
      announced = new Set();
      announcedRef.current.set(key, announced);
    }

    for (const threshold of VOICE_THRESHOLDS_M) {
      if (distM > threshold) continue;
      if (announced.has(threshold)) continue;
      announced.add(threshold);

      const near = threshold <= 90;
      const phrase = buildPhrase(instruction, Math.max(distM, threshold * 0.85), near);
      if (phrase) speakNavigation(phrase);
      break; // uma frase por tick
    }
  }, [active, enabled, instruction, userLat, userLon]);
}
