/** Personas de voz com nomes — mapeiam para vozes do aparelho + tom. */

export interface VoicePersona {
  id: string;
  name: string;
  gender: 'female' | 'male';
  /** Ajuste de tom (SpeechSynthesisUtterance.pitch 0–2). */
  pitch: number;
  rate: number;
  sample: string;
}

export const VOICE_PERSONAS: VoicePersona[] = [
  { id: 'alessandra', name: 'Alessandra', gender: 'female', pitch: 1.08, rate: 1.02, sample: 'Olá, eu sou a Alessandra. Em 300 metros, vire à direita.' },
  { id: 'carla', name: 'Carla', gender: 'female', pitch: 1.18, rate: 1.08, sample: 'Olá, eu sou a Carla. Radar à frente.' },
  { id: 'sofia', name: 'Sofia', gender: 'female', pitch: 1.25, rate: 1.12, sample: 'Oi! Sou a Sofia. Continuidade em frente.' },
  { id: 'joao', name: 'João', gender: 'male', pitch: 0.92, rate: 1.0, sample: 'Olá, eu sou o João. Em 200 metros, vire à esquerda.' },
  { id: 'bruno', name: 'Bruno', gender: 'male', pitch: 0.85, rate: 0.96, sample: 'Oi, sou o Bruno. Lombada à frente.' },
  { id: 'miguel', name: 'Miguel', gender: 'male', pitch: 0.98, rate: 1.05, sample: 'Olá, eu sou o Miguel. Atenção, perigo na via.' },
];

export function getVoicePersona(id: string | null | undefined): VoicePersona {
  return VOICE_PERSONAS.find((p) => p.id === id) ?? VOICE_PERSONAS[0];
}

function scoreVoiceForPersona(voice: SpeechSynthesisVoice, persona: VoicePersona): number {
  let score = 0;
  const name = `${voice.name} ${voice.lang}`.toLowerCase();
  if (/^pt-br/i.test(voice.lang) || voice.lang.toLowerCase() === 'pt_br') score += 40;
  else if (/^pt/i.test(voice.lang)) score += 25;
  if (persona.gender === 'female') {
    if (/female|femin|woman|maria|lucia|luciana|helena|francisca|vit[oó]ria|anna|zira|sabina/i.test(name)) score += 30;
    if (/male|mascul|daniel|david|mark|ricardo|felipe|antonio/i.test(name)) score -= 20;
  } else {
    if (/male|mascul|daniel|david|mark|ricardo|felipe|antonio|paulo|jo[aã]o/i.test(name)) score += 30;
    if (/female|femin|woman|maria|lucia|helena|zira/i.test(name)) score -= 20;
  }
  if (/google|microsoft|neural|natural|premium/i.test(name)) score += 10;
  return score;
}

/** Escolhe a melhor voz do sistema para a persona. */
export function pickSystemVoiceForPersona(persona: VoicePersona): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  let best: SpeechSynthesisVoice | null = null;
  let bestScore = -Infinity;
  for (const v of voices) {
    const s = scoreVoiceForPersona(v, persona);
    if (s > bestScore) {
      bestScore = s;
      best = v;
    }
  }
  return best;
}
