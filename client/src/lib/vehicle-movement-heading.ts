/** Rumbo geográfico en grados (0 = norte, sentido horario). */
export function normalizeHeadingDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

export function bearingFromLatLon(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
): number | null {
  const dLat = to.lat - from.lat;
  const dLon = to.lon - from.lon;
  if (Math.hypot(dLat, dLon) < 1e-6) return null;
  const φ1 = (from.lat * Math.PI) / 180;
  const φ2 = (to.lat * Math.PI) / 180;
  const Δλ = ((to.lon - from.lon) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return normalizeHeadingDeg((Math.atan2(y, x) * 180) / Math.PI);
}

/** Suaviza giros bruscos del marcador (p. ej. ruido GPS). */
export function smoothHeadingDeg(current: number | null, target: number | null, factor = 0.28): number | null {
  if (target == null) return current;
  if (current == null) return normalizeHeadingDeg(target);
  const delta = ((target - current + 540) % 360) - 180;
  if (Math.abs(delta) < 0.4) return normalizeHeadingDeg(target);
  return normalizeHeadingDeg(current + delta * factor);
}

/** `coords.heading` del GPS (0 = norte) cuando hay movimiento. */
export function headingFromGeolocation(coords: GeolocationCoordinates): number | null {
  const speed = coords.speed;
  const heading = coords.heading;
  if (!Number.isFinite(heading) || heading < 0) return null;
  if (Number.isFinite(speed) && speed < 0.4) return null;
  return normalizeHeadingDeg(heading);
}
