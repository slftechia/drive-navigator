import { useEffect, useRef } from 'react';
import type { RoadAlert } from '../api';
import {
  type AlertSoundSettings,
  checkRoadAlertSounds,
  resetAnnouncedAlerts,
  type AnnouncedMap,
} from '../lib/alertSounds';

export function useRoadAlertSounds(
  active: boolean,
  lat: number,
  lon: number,
  alerts: RoadAlert[] | undefined,
  settings: AlertSoundSettings,
  resetToken: number,
  routePoints?: Array<{ lat: number; lon: number }>
): void {
  const announcedRef = useRef<AnnouncedMap>(new Map());

  useEffect(() => {
    resetAnnouncedAlerts(announcedRef.current);
  }, [resetToken]);

  useEffect(() => {
    if (!active || !settings.master) return;

    const tick = () => {
      checkRoadAlertSounds(lat, lon, alerts, settings, announcedRef.current, routePoints);
    };
    tick();
    const id = window.setInterval(tick, 2000);
    return () => window.clearInterval(id);
  }, [
    active,
    lat,
    lon,
    alerts,
    routePoints,
    settings,
    settings.master,
    settings.radar,
    settings.lombada,
    settings.voice,
  ]);
}
