import { haversineM } from "@shared/maps-route-math";
import { computeDrivingRoute } from "./maps-route-service";

const GEOAPIFY_API_KEY = String(
  process.env.GEOAPIFY_API_KEY ?? process.env.VITE_GEOAPIFY_API_KEY ?? "",
).trim();
const GEOAPIFY_BASE = "https://api.geoapify.com/v1";
const MAPS_USER_AGENT =
  process.env.MAPS_HTTP_USER_AGENT ||
  "Applia-CarGo/1.0 (mapa taxi; contacto: soporte applia)";
const MAPS_FETCH_TIMEOUT_MS = Number(process.env.MAPS_FETCH_TIMEOUT_MS || 11_000);

/** Distancia máxima click → calle para aceptar el punto. */
export const SNAP_ROAD_MAX_DISTANCE_M = 85;

export type SnapRoadResult = {
  lat: number;
  lon: number;
  matchDistanceM: number;
};

type MatchedWaypoint = {
  original_index?: number;
  location?: number[];
  original_location?: number[];
  match_type?: string;
  match_distance?: number;
};

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
}

function asLonLat(raw: unknown): { lon: number; lat: number } | null {
  if (!Array.isArray(raw) || raw.length < 2) return null;
  const lon = Number(raw[0]);
  const lat = Number(raw[1]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  return { lon, lat };
}

function firstGeometryPoint(geometry: unknown): { lat: number; lon: number } | null {
  if (!geometry || typeof geometry !== "object") return null;
  const g = geometry as { type?: string; coordinates?: unknown };
  const coords = g.coordinates;
  if (!Array.isArray(coords) || coords.length === 0) return null;
  if (g.type === "LineString") {
    return asLonLat(coords[0]);
  }
  if (g.type === "MultiLineString" && Array.isArray(coords[0])) {
    return asLonLat((coords[0] as unknown[])[0]);
  }
  return asLonLat(coords[0]);
}

async function postMapMatching(waypoints: Array<{ location: [number, number]; timestamp?: string }>) {
  if (!GEOAPIFY_API_KEY) return null;
  const url = `${GEOAPIFY_BASE}/mapmatching?apiKey=${encodeURIComponent(GEOAPIFY_API_KEY)}`;
  const r = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": MAPS_USER_AGENT,
      },
      body: JSON.stringify({ mode: "drive", waypoints }),
    },
    MAPS_FETCH_TIMEOUT_MS,
  );
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    console.error("[maps-snap-road] mapmatching HTTP", r.status, body.slice(0, 300));
    return null;
  }
  return (await r.json()) as {
    features?: Array<{
      properties?: { waypoints?: MatchedWaypoint[] };
      geometry?: { type?: string; coordinates?: unknown };
    }>;
  };
}

/** Fallback: ruta corta; el inicio de la geometría suele estar ya sobre la red vial. */
async function snapViaRouting(lat: number, lon: number): Promise<SnapRoadResult | null> {
  // ~60 m al este (en ecuador ~0.00054°; a lat 10 similar).
  const dLon = 0.00055;
  const route = await computeDrivingRoute(
    { lon, lat },
    { lon: lon + dLon, lat },
  );
  if (route.source !== "geoapify") return null;
  const snapped = firstGeometryPoint(route.geometry);
  if (!snapped) return null;
  const matchDistanceM = haversineM({ lat, lon }, snapped);
  if (matchDistanceM > SNAP_ROAD_MAX_DISTANCE_M) return null;
  return { lat: snapped.lat, lon: snapped.lon, matchDistanceM };
}

async function snapViaMapMatching(lat: number, lon: number): Promise<SnapRoadResult | null> {
  const t0 = new Date().toISOString();
  const t1 = new Date(Date.now() + 1500).toISOString();
  // Separación ~25 m: trazos demasiado cortos suelen fallar en map matching.
  const delta = 0.00022;
  const data = await postMapMatching([
    { location: [lon, lat], timestamp: t0 },
    { location: [lon + delta, lat], timestamp: t1 },
  ]);
  const wps = data?.features?.[0]?.properties?.waypoints;
  if (!Array.isArray(wps) || wps.length === 0) return null;

  const first = wps.find((w) => w.original_index === 0) ?? wps[0];
  const matched = asLonLat(first?.location);
  if (!matched) return null;
  const matchType = String(first?.match_type ?? "");
  if (matchType === "unmatched") return null;

  const matchDistanceM =
    typeof first?.match_distance === "number" && Number.isFinite(first.match_distance)
      ? first.match_distance
      : haversineM({ lat, lon }, { lat: matched.lat, lon: matched.lon });

  if (matchDistanceM > SNAP_ROAD_MAX_DISTANCE_M) return null;

  return {
    lat: matched.lat,
    lon: matched.lon,
    matchDistanceM,
  };
}

/**
 * Ajusta un click al punto más cercano en la red vial (modo drive).
 * Intenta map matching y, si falla, routing corto (mismo Geoapify que ya usa delivery).
 */
export async function snapPointToRoad(lat: number, lon: number): Promise<SnapRoadResult | null> {
  try {
    const viaMatch = await snapViaMapMatching(lat, lon);
    if (viaMatch) return viaMatch;
  } catch (e) {
    console.error("[maps-snap-road] mapmatching failed", e);
  }
  try {
    return await snapViaRouting(lat, lon);
  } catch (e) {
    console.error("[maps-snap-road] routing snap failed", e);
    return null;
  }
}

function flattenMultiLine(coords: unknown): Array<{ lat: number; lon: number }> {
  const out: Array<{ lat: number; lon: number }> = [];
  if (!Array.isArray(coords)) return out;
  for (const part of coords) {
    if (!Array.isArray(part)) continue;
    if (part.length >= 2 && typeof part[0] === "number") {
      const p = asLonLat(part);
      if (p) out.push({ lat: p.lat, lon: p.lon });
      continue;
    }
    for (const pt of part) {
      const p = asLonLat(pt);
      if (p) out.push({ lat: p.lat, lon: p.lon });
    }
  }
  return out;
}

/**
 * Empareja dos extremos a la red vial y devuelve la geometría del tramo (si existe).
 */
export async function matchRoadSegment(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): Promise<{
  a: { lat: number; lon: number };
  b: { lat: number; lon: number };
  path: Array<{ lat: number; lon: number }> | null;
} | null> {
  // Preferir routing (más estable en el plan actual) y map matching como refuerzo.
  try {
    const route = await computeDrivingRoute(
      { lon: a.lon, lat: a.lat },
      { lon: b.lon, lat: b.lat },
    );
    if (route.source === "geoapify") {
      const pathRaw = flattenMultiLine(
        (route.geometry as { coordinates?: unknown } | null)?.coordinates,
      );
      // LineString: coordinates is number[][]
      let path: Array<{ lat: number; lon: number }> = [];
      const g = route.geometry as { type?: string; coordinates?: unknown } | null;
      if (g?.type === "LineString" && Array.isArray(g.coordinates)) {
        for (const pt of g.coordinates as unknown[]) {
          const p = asLonLat(pt);
          if (p) path.push({ lat: p.lat, lon: p.lon });
        }
      } else {
        path = pathRaw;
      }
      if (path.length >= 2) {
        return {
          a: path[0]!,
          b: path[path.length - 1]!,
          path: path.slice(0, 100),
        };
      }
    }
  } catch (e) {
    console.error("[maps-snap-road] segment routing failed", e);
  }

  const t0 = new Date().toISOString();
  const t1 = new Date(Date.now() + 2000).toISOString();
  const data = await postMapMatching([
    { location: [a.lon, a.lat], timestamp: t0 },
    { location: [b.lon, b.lat], timestamp: t1 },
  ]);
  const feature = data?.features?.[0];
  const wps = feature?.properties?.waypoints;
  if (!Array.isArray(wps) || wps.length < 2) return null;

  const wa = wps.find((w) => w.original_index === 0) ?? wps[0];
  const wb = wps.find((w) => w.original_index === 1) ?? wps[wps.length - 1];
  const ma = asLonLat(wa?.location);
  const mb = asLonLat(wb?.location);
  if (!ma || !mb) return null;
  if (String(wa?.match_type) === "unmatched" || String(wb?.match_type) === "unmatched") {
    return null;
  }

  const pathRaw = flattenMultiLine(feature?.geometry?.coordinates);
  const path =
    pathRaw.length >= 2
      ? pathRaw.slice(0, 100)
      : [
          { lat: ma.lat, lon: ma.lon },
          { lat: mb.lat, lon: mb.lon },
        ];

  return {
    a: { lat: ma.lat, lon: ma.lon },
    b: { lat: mb.lat, lon: mb.lon },
    path,
  };
}
