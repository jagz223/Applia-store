import type { GeoJsonObject } from "geojson";
import { haversineM } from "@shared/maps-route-math";

export type LonLat = [number, number];

export type StoredDrivingRoute = {
  /** Coordenadas GeoJSON [lon, lat]. */
  coords: LonLat[];
  totalDistanceM: number;
  totalDurationSec: number;
  targetKey: string;
};

function isLonLatPair(v: unknown): v is LonLat {
  return Array.isArray(v) && v.length >= 2 && Number.isFinite(v[0]) && Number.isFinite(v[1]);
}

/** Extrae vértices [lon,lat] de Feature / LineString / MultiLineString. */
export function extractRouteCoordinates(geometry: unknown): LonLat[] {
  if (!geometry || typeof geometry !== "object") return [];
  const g = geometry as { type?: string; geometry?: unknown; coordinates?: unknown };

  const mergeLinesOriented = (raw: unknown): LonLat[] => {
    if (!Array.isArray(raw)) return [];
    const out: LonLat[] = [];
    for (const line of raw) {
      if (!Array.isArray(line)) continue;
      let pts: LonLat[] = [];
      for (const pt of line) {
        if (isLonLatPair(pt)) pts.push([Number(pt[0]), Number(pt[1])]);
      }
      if (pts.length < 2) continue;
      if (out.length > 0) {
        const last = out[out.length - 1]!;
        const start = pts[0]!;
        const end = pts[pts.length - 1]!;
        const dStart =
          (last[0] - start[0]) ** 2 + (last[1] - start[1]) ** 2;
        const dEnd = (last[0] - end[0]) ** 2 + (last[1] - end[1]) ** 2;
        if (dEnd < dStart) pts = [...pts].reverse();
        const next = pts[0]!;
        if ((last[0] - next[0]) ** 2 + (last[1] - next[1]) ** 2 < 1e-14) {
          pts = pts.slice(1);
        }
      }
      out.push(...pts);
    }
    return out;
  };

  if (g.type === "Feature" && g.geometry) return extractRouteCoordinates(g.geometry);
  if (g.type === "FeatureCollection" && Array.isArray((g as { features?: unknown }).features)) {
    const out: LonLat[] = [];
    for (const f of (g as { features: unknown[] }).features) {
      out.push(...extractRouteCoordinates(f));
    }
    return out;
  }
  if (g.type === "LineString" && Array.isArray(g.coordinates)) {
    const out: LonLat[] = [];
    for (const pt of g.coordinates) {
      if (isLonLatPair(pt)) out.push([Number(pt[0]), Number(pt[1])]);
    }
    return out;
  }
  if (g.type === "MultiLineString" && Array.isArray(g.coordinates)) {
    return mergeLinesOriented(g.coordinates);
  }
  if (Array.isArray(g.coordinates)) {
    const first = g.coordinates[0];
    if (isLonLatPair(first)) {
      const out: LonLat[] = [];
      for (const pt of g.coordinates) {
        if (isLonLatPair(pt)) out.push([Number(pt[0]), Number(pt[1])]);
      }
      return out;
    }
    return mergeLinesOriented(g.coordinates);
  }
  return [];
}

export function geoJsonLineFromCoords(coords: LonLat[]): GeoJsonObject | null {
  if (coords.length < 2) return null;
  return {
    type: "Feature",
    properties: { source: "geoapify" },
    geometry: { type: "LineString", coordinates: coords },
  } as GeoJsonObject;
}

export function polylineLengthM(coords: LonLat[]): number {
  let sum = 0;
  for (let i = 1; i < coords.length; i++) {
    sum += haversineM(
      { lat: coords[i - 1][1], lon: coords[i - 1][0] },
      { lat: coords[i][1], lon: coords[i][0] },
    );
  }
  return sum;
}

function latLonFromCoord(c: LonLat): { lat: number; lon: number } {
  return { lat: c[1], lon: c[0] };
}

/** Distancia mínima de un punto a un segmento (aprox. en WGS84). */
function distancePointToSegmentM(
  point: { lat: number; lon: number },
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const dx = b.lon - a.lon;
  const dy = b.lat - a.lat;
  if (dx === 0 && dy === 0) return haversineM(point, a);
  const t = Math.max(0, Math.min(1, ((point.lon - a.lon) * dx + (point.lat - a.lat) * dy) / (dx * dx + dy * dy)));
  const proj = { lat: a.lat + t * dy, lon: a.lon + t * dx };
  return haversineM(point, proj);
}

export function nearestProgressOnPolyline(
  coords: LonLat[],
  point: { lat: number; lon: number },
): { index: number; distanceM: number } {
  if (coords.length === 0) return { index: 0, distanceM: Infinity };
  if (coords.length === 1) {
    return { index: 0, distanceM: haversineM(point, latLonFromCoord(coords[0])) };
  }
  let bestDist = Infinity;
  let bestIndex = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const a = latLonFromCoord(coords[i]);
    const b = latLonFromCoord(coords[i + 1]);
    const d = distancePointToSegmentM(point, a, b);
    if (d < bestDist) {
      bestDist = d;
      bestIndex = i + 1;
    }
  }
  return { index: bestIndex, distanceM: bestDist };
}

export function isRoadRouteApiPayload(data: {
  source?: string;
  fallback?: boolean;
  geometry?: unknown;
} | null | undefined): boolean {
  if (!data || data.fallback === true || data.source === "fallback") return false;
  return extractRouteCoordinates(data.geometry).length >= 2;
}

export function buildStoredDrivingRoute(
  geometry: unknown,
  targetKey: string,
  distanceM: number,
  durationSec: number,
): StoredDrivingRoute | null {
  const coords = extractRouteCoordinates(geometry);
  if (coords.length < 2) return null;
  const len = polylineLengthM(coords);
  return {
    coords,
    totalDistanceM: len > 0 ? len : Math.max(1, distanceM),
    totalDurationSec: Math.max(60, durationSec),
    targetKey,
  };
}

/**
 * Recorta la ruta por calles desde la posición del conductor (borra lo recorrido).
 * `minIndex` evita retroceder por ruido GPS.
 */
export function trimRouteAtDriver(
  route: StoredDrivingRoute,
  driverPos: { lat: number; lon: number },
  minIndex = 0,
): {
  deviationM: number;
  trimIndex: number;
  trimmedCoords: LonLat[];
  remainingDistanceM: number;
  remainingDurationSec: number;
} {
  const { index, distanceM: deviationM } = nearestProgressOnPolyline(route.coords, driverPos);
  const trimIndex = Math.max(minIndex, Math.min(index, route.coords.length - 1));
  const tail = route.coords.slice(trimIndex);
  const trimmedCoords: LonLat[] = [[driverPos.lon, driverPos.lat], ...tail];
  if (trimmedCoords.length < 2 && route.coords.length >= 2) {
    trimmedCoords.push(route.coords[route.coords.length - 1]);
  }
  const remainingDistanceM = Math.round(polylineLengthM(trimmedCoords));
  const ratio =
    route.totalDistanceM > 0
      ? Math.min(1, Math.max(0, remainingDistanceM / route.totalDistanceM))
      : 1;
  const remainingDurationSec = Math.max(60, Math.round(route.totalDurationSec * ratio));
  return {
    deviationM,
    trimIndex,
    trimmedCoords,
    remainingDistanceM,
    remainingDurationSec,
  };
}
