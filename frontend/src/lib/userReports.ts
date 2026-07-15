import type { RoadAlert } from '../api';

const KEY = 'drive-nav-user-reports-v1';
const MAX = 80;
const TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 dias

export type ReportType = RoadAlert['type'];

export interface UserReport extends RoadAlert {
  createdAt: number;
  source: 'user';
}

function isReport(v: unknown): v is UserReport {
  if (!v || typeof v !== 'object') return false;
  const r = v as UserReport;
  return (
    typeof r.id === 'string' &&
    (r.type === 'radar' || r.type === 'lombada' || r.type === 'perigo') &&
    typeof r.lat === 'number' &&
    typeof r.lon === 'number' &&
    Number.isFinite(r.lat) &&
    Number.isFinite(r.lon)
  );
}

export function loadUserReports(): UserReport[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as UserReport[];
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed
      .filter(isReport)
      .filter((r) => now - (r.createdAt ?? 0) < TTL_MS)
      .slice(0, MAX);
  } catch {
    return [];
  }
}

function persist(reports: UserReport[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(reports.slice(0, MAX)));
  } catch {
    /* quota */
  }
}

export function addUserReport(
  type: ReportType,
  lat: number,
  lon: number,
  label?: string
): UserReport {
  const defaultLabel =
    type === 'radar' ? 'Radar (reportado)' : type === 'lombada' ? 'Lombada (reportada)' : 'Perigo (reportado)';
  const report: UserReport = {
    id: `user-${type}-${Date.now()}-${Math.round(lat * 1e5)}-${Math.round(lon * 1e5)}`,
    type,
    lat,
    lon,
    label: label ?? defaultLabel,
    createdAt: Date.now(),
    source: 'user',
  };
  const next = [report, ...loadUserReports()].slice(0, MAX);
  persist(next);
  return report;
}

export function userReportsAsRoadAlerts(): RoadAlert[] {
  return loadUserReports().map(({ id, type, lat, lon, label }) => ({
    id,
    type,
    lat,
    lon,
    label,
  }));
}

export function clearUserReports(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
