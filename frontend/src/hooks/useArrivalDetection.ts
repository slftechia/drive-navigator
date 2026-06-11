import { useEffect, useRef } from 'react';
import { haversineKm } from '../utils/geo';
import { playArrivalSound, speakNavigation } from '../lib/alertSounds';

const ARRIVAL_DISTANCE_KM = 0.04;
const ARRIVAL_REMAINING_KM = 0.06;

interface UseArrivalDetectionOptions {
  active: boolean;
  position: { lat: number; lon: number };
  destination?: { lat: number; lon: number };
  distanceRemainingKm?: number;
  onArrived: () => void;
}

export function useArrivalDetection({
  active,
  position,
  destination,
  distanceRemainingKm,
  onArrived,
}: UseArrivalDetectionOptions): void {
  const announcedRef = useRef(false);

  useEffect(() => {
    if (!active) {
      announcedRef.current = false;
    }
  }, [active]);

  useEffect(() => {
    if (!active || !destination || announcedRef.current) return;

    const distToDest = haversineKm(position.lat, position.lon, destination.lat, destination.lon);
    const nearDest =
      distToDest <= ARRIVAL_DISTANCE_KM ||
      (distanceRemainingKm != null && distanceRemainingKm <= ARRIVAL_REMAINING_KM);

    if (!nearDest) return;

    announcedRef.current = true;
    playArrivalSound();
    speakNavigation('Você chegou ao destino');
    onArrived();
  }, [active, position.lat, position.lon, destination, distanceRemainingKm, onArrived]);
}
