/** Distancia en línea recta (metros) entre dos puntos WGS84. */
export function haversineM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

/** Velocidad urbana conservadora para estimar tiempo cuando no hay ruta en carretera (m/s). */
export const URBAN_FALLBACK_SPEED_MPS = 28_000 / 3600;

export function estimateDurationSecFromDistanceM(distanceM: number, speedMps = URBAN_FALLBACK_SPEED_MPS): number {
  const d = Math.max(0, Number(distanceM) || 0);
  const v = speedMps > 0 ? speedMps : URBAN_FALLBACK_SPEED_MPS;
  return Math.max(60, Math.round(d / v));
}

export function fallbackDrivingRoute(from: { lon: number; lat: number }, to: { lon: number; lat: number }) {
  const distanceM = haversineM({ lat: from.lat, lon: from.lon }, { lat: to.lat, lon: to.lon });
  const durationSec = estimateDurationSecFromDistanceM(distanceM);
  return {
    distanceM,
    durationSec,
    geometry: {
      type: "Feature",
      properties: { source: "fallback" },
      geometry: {
        type: "LineString",
        coordinates: [
          [from.lon, from.lat],
          [to.lon, to.lat],
        ],
      },
    },
    source: "fallback" as const,
    fallback: true,
  };
}
