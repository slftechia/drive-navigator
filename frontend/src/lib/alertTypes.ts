import type { RoadAlert } from '../api';

/** Tipos de alerta alinhados ao Waze (comunidade + OSM). */
export type RoadAlertType =
  | 'radar'
  | 'lombada'
  | 'policia'
  | 'acidente'
  | 'congestionamento'
  | 'perigo'
  | 'obra'
  | 'via_fechada'
  | 'carro_parado'
  | 'animal'
  | 'clima';

export const ALL_ALERT_TYPES: RoadAlertType[] = [
  'radar',
  'lombada',
  'policia',
  'acidente',
  'congestionamento',
  'perigo',
  'obra',
  'via_fechada',
  'carro_parado',
  'animal',
  'clima',
];

/** Visíveis no mapa. */
export const MAP_ALERT_TYPES = ALL_ALERT_TYPES;

export type MapAlertType = RoadAlertType;

export function isMapAlertType(type: string): type is MapAlertType {
  return (ALL_ALERT_TYPES as string[]).includes(type);
}

export interface AlertTypeMeta {
  type: RoadAlertType;
  icon: string;
  label: string;
  hint: string;
  speak: string;
  reportable: boolean;
}

export const ALERT_TYPE_META: Record<RoadAlertType, AlertTypeMeta> = {
  radar: { type: 'radar', icon: '📷', label: 'Radar', hint: 'Câmera / fiscalização', speak: 'Radar à frente', reportable: true },
  lombada: { type: 'lombada', icon: '◆', label: 'Lombada', hint: 'Redutor de velocidade', speak: 'Lombada à frente', reportable: true },
  policia: { type: 'policia', icon: '🚓', label: 'Polícia', hint: 'Blitz ou viatura', speak: 'Polícia à frente', reportable: true },
  acidente: { type: 'acidente', icon: '💥', label: 'Acidente', hint: 'Colisão na via', speak: 'Acidente à frente', reportable: true },
  congestionamento: {
    type: 'congestionamento',
    icon: '🚦',
    label: 'Congestionamento',
    hint: 'Trânsito parado ou lento',
    speak: 'Congestionamento à frente',
    reportable: true,
  },
  perigo: { type: 'perigo', icon: '⚠️', label: 'Perigo', hint: 'Obstáculo ou risco', speak: 'Perigo à frente', reportable: true },
  obra: { type: 'obra', icon: '🚧', label: 'Obra', hint: 'Obras na pista', speak: 'Obra à frente', reportable: true },
  via_fechada: { type: 'via_fechada', icon: '🚫', label: 'Via fechada', hint: 'Bloqueio total', speak: 'Via fechada à frente', reportable: true },
  carro_parado: { type: 'carro_parado', icon: '🚗', label: 'Carro parado', hint: 'Veículo na pista', speak: 'Carro parado à frente', reportable: true },
  animal: { type: 'animal', icon: '🐾', label: 'Animal', hint: 'Animal na via', speak: 'Animal na via', reportable: true },
  clima: { type: 'clima', icon: '🌧️', label: 'Clima', hint: 'Chuva, neblina, alagamento', speak: 'Alerta de clima à frente', reportable: true },
};

export function alertTypeLabel(type: RoadAlert['type'] | string): string {
  return ALERT_TYPE_META[type as RoadAlertType]?.label ?? 'Alerta';
}

export function alertTypeIcon(type: RoadAlert['type'] | string): string {
  return ALERT_TYPE_META[type as RoadAlertType]?.icon ?? '⚠️';
}

export function alertTypeSpeak(type: RoadAlert['type'] | string): string {
  return ALERT_TYPE_META[type as RoadAlertType]?.speak ?? 'Alerta à frente';
}

export function defaultAlertLabel(type: RoadAlertType): string {
  const m = ALERT_TYPE_META[type];
  return `${m.label} (comunidade)`;
}
