/** Estimativa de trânsito a partir da rota OSRM + horário (sem feed ao vivo). */

export type TrafficLevel = 'free' | 'moderate' | 'busy' | 'unknown';

export interface TrafficEstimate {
  level: TrafficLevel;
  /** Texto curto para a prévia (estilo Waze). */
  label: string;
  /** Velocidade média implícita da rota (km/h). */
  avgSpeedKmh: number | null;
}

function isWeekdayRush(now: Date): boolean {
  const day = now.getDay(); // 0=dom
  if (day === 0 || day === 6) return false;
  const h = now.getHours();
  const m = now.getMinutes();
  const mins = h * 60 + m;
  // 7h–9h30 e 17h–20h
  return (mins >= 7 * 60 && mins <= 9 * 60 + 30) || (mins >= 17 * 60 && mins <= 20 * 60);
}

/**
 * OSRM usa velocidade de fluxo livre. Inferimos pressão pelo ritmo médio
 * e ajustamos levemente em horários de pico (BR urbano).
 */
export function estimateTrafficFromRoute(
  distanceKm: number,
  durationMinutes: number,
  now: Date = new Date()
): TrafficEstimate {
  if (!(distanceKm > 0) || !(durationMinutes > 0)) {
    return { level: 'unknown', label: 'Estimativa sem trânsito ao vivo', avgSpeedKmh: null };
  }

  const avgSpeedKmh = (distanceKm / durationMinutes) * 60;
  const rush = isWeekdayRush(now);

  let level: TrafficLevel;
  if (avgSpeedKmh < 20) level = 'busy';
  else if (avgSpeedKmh < 32) level = 'moderate';
  else level = 'free';

  if (rush) {
    if (level === 'free' && avgSpeedKmh < 55) level = 'moderate';
    else if (level === 'moderate' && avgSpeedKmh < 28) level = 'busy';
  }

  const label =
    level === 'free'
      ? 'Melhor rota · fluxo livre (estimado)'
      : level === 'moderate'
        ? 'Melhor rota · trânsito moderado (estimado)'
        : 'Melhor rota · trânsito intenso (estimado)';

  return { level, label, avgSpeedKmh };
}

/** Compara rota selecionada com a mais rápida para subtítulo. */
export function trafficRelativeHint(
  selectedMinutes: number,
  fastestMinutes: number
): string | null {
  if (!(selectedMinutes > 0) || !(fastestMinutes > 0)) return null;
  const delta = Math.round(selectedMinutes - fastestMinutes);
  if (delta <= 1) return null;
  return `+${delta} min vs. mais rápida`;
}

/**
 * Durante a navegação: compara o ritmo do GPS com o tempo OSRM (fluxo livre)
 * proporcional à distância restante — sinal real de atraso sem API paga.
 */
export function liveTrafficFromPace(
  remainingKm: number,
  freeFlowRemainingMinutes: number,
  speedMps: number | null | undefined
): TrafficEstimate | null {
  const speedKmh = (speedMps ?? 0) * 3.6;
  if (speedKmh < 12 || remainingKm < 0.4 || !(freeFlowRemainingMinutes > 0)) return null;

  const liveMinutes = (remainingKm / speedKmh) * 60;
  const ratio = liveMinutes / freeFlowRemainingMinutes;

  if (ratio >= 1.4) {
    return {
      level: 'busy',
      label: 'Mais lento que o previsto',
      avgSpeedKmh: speedKmh,
    };
  }
  if (ratio >= 1.18) {
    return {
      level: 'moderate',
      label: 'Um pouco mais lento',
      avgSpeedKmh: speedKmh,
    };
  }
  if (ratio <= 0.82) {
    return {
      level: 'free',
      label: 'Mais rápido que o previsto',
      avgSpeedKmh: speedKmh,
    };
  }
  return {
    level: 'free',
    label: 'No ritmo previsto',
    avgSpeedKmh: speedKmh,
  };
}
