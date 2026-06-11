export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Direção em graus (0=norte) entre dois pontos. */
export function bearingDeg(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const deg = (Math.atan2(y, x) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/** Ponto a uma distância e rumo (0=norte) a partir de lat/lon. */
export function destinationPoint(
  lat: number,
  lon: number,
  bearing: number,
  distanceKm: number
): { lat: number; lon: number } {
  const R = 6371;
  const δ = distanceKm / R;
  const θ = (bearing * Math.PI) / 180;
  const φ1 = (lat * Math.PI) / 180;
  const λ1 = (lon * Math.PI) / 180;
  const φ2 = Math.asin(
    Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ)
  );
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
      Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2)
    );
  return { lat: (φ2 * 180) / Math.PI, lon: (λ2 * 180) / Math.PI };
}

/** Suaviza rotação do mapa (menor salto ao virar). */
export function smoothBearingDeg(
  prev: number | null,
  next: number,
  factor = 0.3
): number {
  const target = (next + 360) % 360;
  if (prev == null || Number.isNaN(prev)) return target;
  let delta = target - prev;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return (prev + delta * factor + 360) % 360;
}

export function formatDistanceKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${Math.round(km)} km`;
}

function projectOnSegment(
  p: { lat: number; lon: number },
  a: { lat: number; lon: number },
  b: { lat: number; lon: number }
): { lat: number; lon: number } {
  const dx = b.lon - a.lon;
  const dy = b.lat - a.lat;
  const t = Math.max(
    0,
    Math.min(1, ((p.lon - a.lon) * dx + (p.lat - a.lat) * dy) / (dx * dx + dy * dy + 1e-12))
  );
  return { lat: a.lat + t * dy, lon: a.lon + t * dx };
}

/** Cola o alerta na linha da rota (OSM costuma ficar na rua paralela). */
export function snapPointToRoute(
  point: { lat: number; lon: number },
  routePoints: Array<{ lat: number; lon: number }>,
  fine = false
): { lat: number; lon: number; distanceKm: number } {
  if (routePoints.length === 0) {
    return { lat: point.lat, lon: point.lon, distanceKm: Infinity };
  }
  if (routePoints.length === 1) {
    const d = haversineKm(point.lat, point.lon, routePoints[0].lat, routePoints[0].lon);
    return { lat: routePoints[0].lat, lon: routePoints[0].lon, distanceKm: d };
  }

  let bestLat = routePoints[0].lat;
  let bestLon = routePoints[0].lon;
  let minD = Infinity;
  const step = fine
    ? 1
    : routePoints.length > 3000
      ? 3
      : routePoints.length > 1000
        ? 2
        : 1;

  for (let i = 0; i < routePoints.length - step; i += step) {
    const proj = projectOnSegment(point, routePoints[i], routePoints[i + step]);
    const d = haversineKm(point.lat, point.lon, proj.lat, proj.lon);
    if (d < minD) {
      minD = d;
      bestLat = proj.lat;
      bestLon = proj.lon;
    }
  }

  return { lat: bestLat, lon: bestLon, distanceKm: minD };
}

/** Distância perpendicular do ponto à polyline da rota (km). */
export function distanceToRouteKm(
  point: { lat: number; lon: number },
  routePoints: Array<{ lat: number; lon: number }>
): number {
  return snapPointToRoute(point, routePoints).distanceKm;
}

/** Quilômetros percorridos ao longo da polyline até o ponto projetado. */
export function routeProgressKm(
  point: { lat: number; lon: number },
  routePoints: Array<{ lat: number; lon: number }>
): number {
  if (routePoints.length < 2) return 0;

  const step = routePoints.length > 3000 ? 3 : routePoints.length > 1000 ? 2 : 1;
  let bestIdx = 0;
  let bestDist = Infinity;
  let bestT = 0;

  for (let i = 0; i < routePoints.length - step; i += step) {
    const a = routePoints[i];
    const b = routePoints[i + step];
    const proj = projectOnSegment(point, a, b);
    const d = haversineKm(point.lat, point.lon, proj.lat, proj.lon);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
      const segLen = haversineKm(a.lat, a.lon, b.lat, b.lon) || 1e-9;
      bestT = haversineKm(a.lat, a.lon, proj.lat, proj.lon) / segLen;
    }
  }

  let progress = 0;
  for (let i = 0; i < bestIdx; i++) {
    progress += haversineKm(
      routePoints[i].lat,
      routePoints[i].lon,
      routePoints[i + 1].lat,
      routePoints[i + 1].lon
    );
  }
  const segEnd = routePoints[bestIdx + step] ?? routePoints[bestIdx + 1];
  if (segEnd) {
    progress += haversineKm(
      routePoints[bestIdx].lat,
      routePoints[bestIdx].lon,
      segEnd.lat,
      segEnd.lon
    ) * Math.max(0, Math.min(1, bestT));
  }
  return progress;
}

/** Rumo de condução ao longo da rota (sempre sentido destino, evita mapa invertido). */
export function routeHeadingAtPoint(
  point: { lat: number; lon: number },
  routePoints: Array<{ lat: number; lon: number }>,
  lookAheadKm = 0.07
): number | null {
  if (routePoints.length < 2) return null;

  const targetKm = routeProgressKm(point, routePoints);
  let walked = 0;
  let fromLat = routePoints[0].lat;
  let fromLon = routePoints[0].lon;

  for (let i = 0; i < routePoints.length - 1; i++) {
    const a = routePoints[i];
    const b = routePoints[i + 1];
    const segLen = haversineKm(a.lat, a.lon, b.lat, b.lon);
    if (segLen < 1e-9) continue;

    const segStart = walked;
    const segEnd = walked + segLen;

    if (targetKm <= segEnd || i === routePoints.length - 2) {
      const t = Math.max(0, Math.min(1, (targetKm - segStart) / segLen));
      fromLat = a.lat + t * (b.lat - a.lat);
      fromLon = a.lon + t * (b.lon - a.lon);

      let ahead = 0;
      let toLat = b.lat;
      let toLon = b.lon;
      for (let j = i; j < routePoints.length - 1 && ahead < lookAheadKm; j++) {
        const p1 = j === i ? { lat: fromLat, lon: fromLon } : routePoints[j];
        const p2 = routePoints[j + 1];
        const len = haversineKm(p1.lat, p1.lon, p2.lat, p2.lon);
        if (len < 1e-9) continue;
        if (ahead + len >= lookAheadKm) {
          const u = (lookAheadKm - ahead) / len;
          toLat = p1.lat + u * (p2.lat - p1.lat);
          toLon = p1.lon + u * (p2.lon - p1.lon);
          break;
        }
        ahead += len;
        toLat = p2.lat;
        toLon = p2.lon;
      }
      return bearingDeg(fromLat, fromLon, toLat, toLon);
    }
    walked = segEnd;
  }

  const prev = routePoints[routePoints.length - 2];
  const last = routePoints[routePoints.length - 1];
  return bearingDeg(prev.lat, prev.lon, last.lat, last.lon);
}

/** Recorte da polyline ao redor da posição atual (para buscar alertas no trecho). */
export function sliceRouteWindow(
  routePoints: Array<{ lat: number; lon: number }>,
  lat: number,
  lon: number,
  behindKm = 25,
  aheadKm = 55
): Array<{ lat: number; lon: number }> {
  if (routePoints.length < 2) return routePoints;

  const targetKm = routeProgressKm({ lat, lon }, routePoints);
  const startKm = Math.max(0, targetKm - behindKm);
  const endKm = targetKm + aheadKm;

  let walked = 0;
  let startIdx = 0;
  let endIdx = routePoints.length - 1;

  for (let i = 1; i < routePoints.length; i++) {
    walked += haversineKm(
      routePoints[i - 1].lat,
      routePoints[i - 1].lon,
      routePoints[i].lat,
      routePoints[i].lon
    );
    if (walked >= startKm) {
      startIdx = Math.max(0, i - 1);
      break;
    }
  }

  walked = 0;
  for (let i = 1; i < routePoints.length; i++) {
    walked += haversineKm(
      routePoints[i - 1].lat,
      routePoints[i - 1].lon,
      routePoints[i].lat,
      routePoints[i].lon
    );
    if (walked >= endKm) {
      endIdx = Math.min(routePoints.length - 1, i);
      break;
    }
  }

  const slice = routePoints.slice(startIdx, endIdx + 1);
  return slice.length >= 2 ? slice : routePoints.slice(0, Math.min(800, routePoints.length));
}

/** Limite estimado da via (km/h) com base na velocidade média planejada. */
export function estimateRoadSpeedLimitKmh(
  remainingKm: number,
  durationRemainingMinutes: number
): number {
  if (remainingKm <= 0.08) return 30;
  if (durationRemainingMinutes <= 0) return 40;
  const avgKmh = (remainingKm / durationRemainingMinutes) * 60;
  if (avgKmh >= 75) return 80;
  if (avgKmh >= 52) return 60;
  if (avgKmh >= 32) return 40;
  return 30;
}

/** Tempo e distância restantes a partir da posição atual na polyline. */
export function estimateRouteRemainder(
  lat: number,
  lon: number,
  routePoints: Array<{ lat: number; lon: number }>,
  totalDurationMinutes: number,
  totalDistanceKm: number,
  speedMps?: number | null
): {
  distanceRemainingKm: number;
  durationRemainingMinutes: number;
  arrivalTime: Date;
} {
  const fallback = {
    distanceRemainingKm: totalDistanceKm,
    durationRemainingMinutes: totalDurationMinutes,
    arrivalTime: new Date(Date.now() + totalDurationMinutes * 60_000),
  };
  if (routePoints.length < 2 || totalDistanceKm <= 0) return fallback;

  const step = routePoints.length > 5000 ? 3 : routePoints.length > 2000 ? 2 : 1;
  let bestIdx = 0;
  let bestDist = Infinity;
  let bestT = 0;

  for (let i = 0; i < routePoints.length - step; i += step) {
    const a = routePoints[i];
    const b = routePoints[i + step];
    const proj = projectOnSegment({ lat, lon }, a, b);
    const d = haversineKm(lat, lon, proj.lat, proj.lon);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
      const segLen = haversineKm(a.lat, a.lon, b.lat, b.lon) || 1e-9;
      bestT = haversineKm(a.lat, a.lon, proj.lat, proj.lon) / segLen;
    }
  }

  let remainingKm = 0;
  const segEnd = routePoints[bestIdx + step] ?? routePoints[bestIdx + 1];
  if (segEnd) {
    const segLen = haversineKm(
      routePoints[bestIdx].lat,
      routePoints[bestIdx].lon,
      segEnd.lat,
      segEnd.lon
    );
    remainingKm += segLen * Math.max(0, 1 - bestT);
  }
  for (let i = bestIdx + step; i < routePoints.length - 1; i++) {
    remainingKm += haversineKm(
      routePoints[i].lat,
      routePoints[i].lon,
      routePoints[i + 1].lat,
      routePoints[i + 1].lon
    );
  }

  remainingKm = Math.min(totalDistanceKm, Math.max(0, remainingKm));
  const fraction = remainingKm / totalDistanceKm;

  let durationRemainingMinutes: number;
  const speedKmh = (speedMps ?? 0) * 3.6;
  if (speedKmh >= 8 && remainingKm > 0.02) {
    durationRemainingMinutes = Math.max(1, Math.round((remainingKm / speedKmh) * 60));
  } else {
    durationRemainingMinutes = Math.max(1, Math.round(totalDurationMinutes * fraction));
  }

  return {
    distanceRemainingKm: remainingKm,
    durationRemainingMinutes,
    arrivalTime: new Date(Date.now() + durationRemainingMinutes * 60_000),
  };
}
