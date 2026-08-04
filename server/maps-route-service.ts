import { fallbackDrivingRoute, haversineM } from "@shared/maps-route-math";

const GEOAPIFY_API_KEY = String(
  process.env.GEOAPIFY_API_KEY ?? process.env.VITE_GEOAPIFY_API_KEY ?? ""
).trim();
const GEOAPIFY_BASE = "https://api.geoapify.com/v1";

const MAPS_USER_AGENT =
  process.env.MAPS_HTTP_USER_AGENT ||
  "Applia-CarGo/1.0 (mapa taxi; contacto: soporte applia)";

const MAPS_ROUTE_FETCH_TIMEOUT_MS = Number(process.env.MAPS_ROUTE_FETCH_TIMEOUT_MS || 22_000);

const ROUTE_CACHE_TTL_MS = 5 * 60_000;
const LIVE_ROUTE_CACHE_TTL_MS = 45_000;

/** Rutas urbanas cortas: priorizar camino más corto (menos vueltas absurdas). */
const SHORT_ROUTE_HAVERSINE_M = 8_000;

type CacheEntry<T> = { expiresAt: number; value: T };
const routeCache = new Map<string, CacheEntry<DrivingRouteResult>>();

export type DrivingRouteResult = {
  distanceM: number;
  durationSec: number;
  geometry: unknown;
  source: "geoapify" | "fallback";
  fallback?: boolean;
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

function pointDist2(a: number[], b: number[]): number {
  const dx = (a[0] ?? 0) - (b[0] ?? 0);
  const dy = (a[1] ?? 0) - (b[1] ?? 0);
  return dx * dx + dy * dy;
}

function asLonLatLine(raw: unknown): number[][] | null {
  if (!Array.isArray(raw) || raw.length < 2) return null;
  const out: number[][] = [];
  for (const pt of raw) {
    if (!Array.isArray(pt) || pt.length < 2) continue;
    const lon = Number(pt[0]);
    const lat = Number(pt[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    out.push([lon, lat]);
  }
  return out.length >= 2 ? out : null;
}

/**
 * Une MultiLineString en un LineString continuo, orientando cada tramo
 * para que el inicio quede cerca del final del tramo anterior (evita dibujar
 * calles “en contra” por segmentos invertidos).
 */
function mergeRouteGeometry(geom: { type?: string; coordinates?: unknown }): unknown {
  if (!geom || typeof geom !== "object") return null;
  if (geom.type === "LineString") {
    const line = asLonLatLine(geom.coordinates);
    return line ? { type: "LineString", coordinates: line } : null;
  }
  if (geom.type === "MultiLineString" && Array.isArray(geom.coordinates)) {
    const merged: number[][] = [];
    for (const rawLine of geom.coordinates as unknown[]) {
      let line = asLonLatLine(rawLine);
      if (!line) continue;
      if (merged.length > 0) {
        const last = merged[merged.length - 1]!;
        const start = line[0]!;
        const end = line[line.length - 1]!;
        if (pointDist2(last, end) + 1e-18 < pointDist2(last, start)) {
          line = [...line].reverse();
        }
        const nextStart = line[0]!;
        if (pointDist2(last, nextStart) < 1e-14) {
          line = line.slice(1);
        }
      }
      for (const pt of line) merged.push(pt);
    }
    if (merged.length < 2) return null;
    return { type: "LineString", coordinates: merged };
  }
  return geom;
}

function distanceMetersFromGeoapifyProps(props: Record<string, unknown>): number {
  const d = Number(props.distance);
  if (!Number.isFinite(d) || d < 0) return 0;
  const units = String(props.distance_units ?? "Meters").toLowerCase();
  if (units.includes("mile")) return Math.round(d * 1609.344);
  return Math.round(d);
}

function cacheGet(key: string): DrivingRouteResult | null {
  const e = routeCache.get(key);
  if (!e) return null;
  if (e.expiresAt < Date.now()) {
    routeCache.delete(key);
    return null;
  }
  return e.value;
}

function cacheSet(key: string, value: DrivingRouteResult, ttlMs: number) {
  routeCache.set(key, { expiresAt: Date.now() + ttlMs, value });
}

function resolveRouteType(from: { lon: number; lat: number }, to: { lon: number; lat: number }): "short" | "balanced" {
  const straight = haversineM({ lat: from.lat, lon: from.lon }, { lat: to.lat, lon: to.lon });
  return straight <= SHORT_ROUTE_HAVERSINE_M ? "short" : "balanced";
}

/**
 * Ruta en coche (Geoapify) o fallback en línea recta.
 * Coordenadas: `{ lon, lat }` (convención GeoJSON del backend).
 */
export async function computeDrivingRoute(
  from: { lon: number; lat: number },
  to: { lon: number; lat: number },
  opts?: { live?: boolean },
): Promise<DrivingRouteResult> {
  const live = !!opts?.live;
  const routeType = resolveRouteType(from, to);
  // Prefijo v3: invalida caché anterior tras cambios de type/traffic/merge.
  const cacheKey = live
    ? `ga-v3|live|${routeType}|from=${from.lon.toFixed(5)},${from.lat.toFixed(5)}|to=${to.lon.toFixed(5)},${to.lat.toFixed(5)}`
    : `ga-v3|${routeType}|from=${from.lon.toFixed(4)},${from.lat.toFixed(4)}|to=${to.lon.toFixed(5)},${to.lat.toFixed(5)}`;
  const cacheTtlMs = live ? LIVE_ROUTE_CACHE_TTL_MS : ROUTE_CACHE_TTL_MS;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  if (!GEOAPIFY_API_KEY) {
    const payload = fallbackDrivingRoute(from, to);
    cacheSet(cacheKey, payload, 30_000);
    return payload;
  }

  const waypoints = `lonlat:${from.lon},${from.lat}|lonlat:${to.lon},${to.lat}`;
  try {
    const url = new URL(`${GEOAPIFY_BASE}/routing`);
    url.searchParams.set("waypoints", waypoints);
    url.searchParams.set("mode", "drive");
    // Rutas urbanas cortas: camino más corto; largas: equilibrado (tiempo/distancia).
    url.searchParams.set("type", routeType);
    // Respeta mejor flujo real; el modo drive ya usa sentido de calles de OSM.
    url.searchParams.set("traffic", "approximated");
    url.searchParams.set("lang", "es");
    url.searchParams.set("units", "metric");
    url.searchParams.set("apiKey", GEOAPIFY_API_KEY);

    const r = await fetchWithTimeout(
      url.toString(),
      { headers: { "User-Agent": MAPS_USER_AGENT, Accept: "application/json" } },
      MAPS_ROUTE_FETCH_TIMEOUT_MS,
    );
    if (!r.ok) {
      const bodyText = await r.text().catch(() => "");
      console.error("[maps-route-service] geoapify HTTP", r.status, bodyText.slice(0, 300));
      const payload = fallbackDrivingRoute(from, to);
      cacheSet(cacheKey, payload, 30_000);
      return payload;
    }
    const data = (await r.json()) as { features?: any[] };
    const feature = data.features?.[0];
    const props = feature?.properties && typeof feature.properties === "object" ? feature.properties : {};
    const geometry = mergeRouteGeometry(feature?.geometry);
    const distanceM = distanceMetersFromGeoapifyProps(props as Record<string, unknown>);
    const durationSec = Math.max(60, Math.round(Number((props as { time?: number }).time) || 0));
    if (!geometry || distanceM <= 0) {
      const payload = fallbackDrivingRoute(from, to);
      cacheSet(cacheKey, payload, 30_000);
      return payload;
    }
    const payload: DrivingRouteResult = {
      distanceM,
      durationSec,
      geometry,
      source: "geoapify",
    };
    cacheSet(cacheKey, payload, cacheTtlMs);
    return payload;
  } catch (e) {
    console.error("[maps-route-service] route failed", e);
    const payload = fallbackDrivingRoute(from, to);
    cacheSet(cacheKey, payload, 30_000);
    return payload;
  }
}
