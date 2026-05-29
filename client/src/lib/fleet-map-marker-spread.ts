/**
 * Reparte marcadores de flota que comparten la misma zona GPS para evitar solapamiento en el mapa.
 * Solo afecta la posición visual; las coordenadas reales del conductor no cambian.
 */

export type FleetMapPoint = {
  userId: string;
  lat: number;
  lon: number;
};

const EARTH_RADIUS_M = 6_378_137;

/** Agrupa puntos a ~15 m (4 decimales ≈ 11 m en Ecuador). */
function clusterKey(lat: number, lon: number): string {
  return `${lat.toFixed(4)},${lon.toFixed(4)}`;
}

function offsetMeters(lat: number, lon: number, distanceM: number, angleRad: number): { lat: number; lon: number } {
  const latRad = (lat * Math.PI) / 180;
  const dLat = ((distanceM * Math.cos(angleRad)) / EARTH_RADIUS_M) * (180 / Math.PI);
  const dLon = ((distanceM * Math.sin(angleRad)) / (EARTH_RADIUS_M * Math.cos(latRad))) * (180 / Math.PI);
  return { lat: lat + dLat, lon: lon + dLon };
}

/** Radio del anillo según zoom (más cerca = círculo más pequeño en metros). */
function spreadRadiusMeters(zoom: number, count: number): number {
  const zoomFactor = Math.pow(2, 13 - zoom);
  const base = 10 * zoomFactor;
  const countBoost = 1 + Math.max(0, count - 2) * 0.12;
  return Math.min(40, Math.max(6, base * countBoost));
}

/**
 * Devuelve posición de mapa por userId (desplazada si hay coincidencias en la misma celda).
 * Orden estable por userId para que no “salten” entre refrescos.
 */
export function spreadFleetMapMarkerPositions(
  points: readonly FleetMapPoint[],
  zoom: number,
): Map<string, { lat: number; lon: number }> {
  const out = new Map<string, { lat: number; lon: number }>();
  if (points.length === 0) return out;

  const groups = new Map<string, FleetMapPoint[]>();
  for (const p of points) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
    const key = clusterKey(p.lat, p.lon);
    const list = groups.get(key) ?? [];
    list.push(p);
    groups.set(key, list);
  }

  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => a.userId.localeCompare(b.userId));
    if (sorted.length === 1) {
      const p = sorted[0]!;
      out.set(p.userId, { lat: p.lat, lon: p.lon });
      continue;
    }

    const centerLat = sorted.reduce((s, p) => s + p.lat, 0) / sorted.length;
    const centerLon = sorted.reduce((s, p) => s + p.lon, 0) / sorted.length;
    const radiusM = spreadRadiusMeters(zoom, sorted.length);

    sorted.forEach((p, index) => {
      const angle = (2 * Math.PI * index) / sorted.length - Math.PI / 2;
      out.set(p.userId, offsetMeters(centerLat, centerLon, radiusM, angle));
    });
  }

  return out;
}
