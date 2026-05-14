import type { Express, Request, Response } from "express";

const GEOAPIFY_API_KEY = String(
  process.env.GEOAPIFY_API_KEY ?? process.env.VITE_GEOAPIFY_API_KEY ?? ""
).trim();
const GEOAPIFY_BASE = "https://api.geoapify.com/v1";

const MAPS_USER_AGENT =
  process.env.MAPS_HTTP_USER_AGENT ||
  "GenFeb-CarGo/1.0 (mapa taxi; contacto: soporte genfeb)";

const MAPS_FETCH_TIMEOUT_MS = Number(process.env.MAPS_FETCH_TIMEOUT_MS || 11_000);
const MAPS_ROUTE_FETCH_TIMEOUT_MS = Number(process.env.MAPS_ROUTE_FETCH_TIMEOUT_MS || 22_000);

const ROUTE_CACHE_TTL_MS = 5 * 60_000;
const REVERSE_CACHE_TTL_MS = 30 * 60_000;

type CacheEntry<T> = { expiresAt: number; value: T };
const routeCache = new Map<string, CacheEntry<any>>();
const reverseCache = new Map<string, CacheEntry<any>>();
const geocodeCache = new Map<string, CacheEntry<any>>();

function nowMs() {
  return Date.now();
}

function cacheGet<T>(m: Map<string, CacheEntry<T>>, key: string): T | null {
  const e = m.get(key);
  if (!e) return null;
  if (e.expiresAt < nowMs()) {
    m.delete(key);
    return null;
  }
  return e.value;
}

function cacheSet<T>(m: Map<string, CacheEntry<T>>, key: string, value: T, ttlMs: number) {
  m.set(key, { expiresAt: nowMs() + ttlMs, value });
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
}

function haversineM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

function fallbackRoute(from: { lon: number; lat: number }, to: { lon: number; lat: number }) {
  const distanceM = haversineM({ lat: from.lat, lon: from.lon }, { lat: to.lat, lon: to.lon });
  const durationSec = Math.round(distanceM / (28_000 / 3600));
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
    fallback: true,
    source: "fallback" as const,
  };
}

/** Espera `lon,lat` (convención GeoJSON usada por el backend taxi). */
function parseLonLatPair(s: string): { lon: number; lat: number } | null {
  const parts = s.split(",").map((p) => Number(p.trim()));
  if (parts.length !== 2 || !parts.every((n) => Number.isFinite(n))) return null;
  return { lon: parts[0], lat: parts[1] };
}

function geoapifyHeaders(): HeadersInit {
  return {
    "User-Agent": MAPS_USER_AGENT,
    Accept: "application/json",
  };
}

/** Une tramos MultiLineString en una sola LineString para compatibilidad con el GeoJSON de Leaflet en taxi. */
function mergeRouteGeometry(geom: { type?: string; coordinates?: unknown }): unknown {
  if (!geom || typeof geom !== "object") return null;
  if (geom.type === "LineString" && Array.isArray(geom.coordinates)) return geom;
  if (geom.type === "MultiLineString" && Array.isArray(geom.coordinates)) {
    const lines = geom.coordinates as number[][][];
    const merged: number[][] = [];
    for (const line of lines) {
      if (!Array.isArray(line)) continue;
      for (const pt of line) {
        if (Array.isArray(pt) && pt.length >= 2) merged.push(pt);
      }
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

export function registerMapRoutes(app: Express): void {
  const requireGeoapify = (res: Response): boolean => {
    if (GEOAPIFY_API_KEY) return true;
    res.status(503).json({
      message:
        "Falta GEOAPIFY_API_KEY en el servidor (.env). Para teselas en el cliente añade también VITE_GEOAPIFY_API_KEY.",
    });
    return false;
  };

  /** Búsqueda / autocomplete de direcciones (Geoapify → mismo contrato `{ lat, lon, label }[]`). */
  app.get("/api/maps/geocode", async (req: Request, res: Response) => {
    if (!requireGeoapify(res)) return;
    const q = String(req.query.q ?? "").trim();
    if (q.length < 2) return res.status(400).json({ message: "Escribe al menos 2 caracteres" });
    if (q.length > 280) return res.status(400).json({ message: "Consulta demasiado larga" });
    const limit = Math.min(10, Math.max(1, Number(req.query.limit) || 6));
    const url = new URL(`${GEOAPIFY_BASE}/geocode/autocomplete`);
    url.searchParams.set("text", q);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("lang", "es");
    url.searchParams.set("apiKey", GEOAPIFY_API_KEY);
    try {
      const cacheKey = `ga|q=${q.toLowerCase()}&limit=${limit}`;
      const cached = cacheGet(geocodeCache, cacheKey);
      if (cached) return res.json(cached);

      const r = await fetchWithTimeout(url.toString(), { headers: geoapifyHeaders() }, MAPS_FETCH_TIMEOUT_MS);
      if (!r.ok) return res.status(502).json({ message: "Servicio de búsqueda no disponible" });
      const data = (await r.json()) as { features?: unknown[] };
      const feats = Array.isArray(data.features) ? data.features : [];
      const out = feats
        .map((f: any) => {
          const coords = f?.geometry?.coordinates;
          const lon = Array.isArray(coords) ? Number(coords[0]) : NaN;
          const lat = Array.isArray(coords) ? Number(coords[1]) : NaN;
          const label = String(f?.properties?.formatted ?? f?.properties?.address_line1 ?? "").trim();
          return { lat, lon, label: label || `${lat}, ${lon}` };
        })
        .filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lon));
      cacheSet(geocodeCache, cacheKey, out, 60_000);
      res.json(out);
    } catch {
      res.status(502).json({ message: "No se pudo contactar el servicio de mapas" });
    }
  });

  /** Geocodificación inversa (Geoapify). */
  app.get("/api/maps/reverse", async (req: Request, res: Response) => {
    if (!requireGeoapify(res)) return;
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return res.status(400).json({ message: "Coordenadas inválidas" });
    }
    const url = new URL(`${GEOAPIFY_BASE}/geocode/reverse`);
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lon));
    url.searchParams.set("lang", "es");
    url.searchParams.set("apiKey", GEOAPIFY_API_KEY);
    try {
      const cacheKey = `${lat.toFixed(5)},${lon.toFixed(5)}`;
      const cached = cacheGet(reverseCache, cacheKey);
      if (cached) return res.json(cached);

      const r = await fetchWithTimeout(url.toString(), { headers: geoapifyHeaders() }, MAPS_FETCH_TIMEOUT_MS);
      if (!r.ok) return res.status(502).json({ message: "Servicio inverso no disponible" });
      const data = (await r.json()) as { features?: any[] };
      const f = data.features?.[0];
      const coords = f?.geometry?.coordinates;
      const outLon = Array.isArray(coords) ? Number(coords[0]) : lon;
      const outLat = Array.isArray(coords) ? Number(coords[1]) : lat;
      const label = String(
        f?.properties?.formatted ?? `${outLat.toFixed(5)}, ${outLon.toFixed(5)}`
      );
      const payload = {
        lat: Number.isFinite(outLat) ? outLat : lat,
        lon: Number.isFinite(outLon) ? outLon : lon,
        label,
      };
      cacheSet(reverseCache, cacheKey, payload, REVERSE_CACHE_TTL_MS);
      res.json(payload);
    } catch {
      res.status(502).json({ message: "No se pudo contactar el servicio de mapas" });
    }
  });

  /**
   * Ruta en coche (Geoapify): distancia, duración y geometría Leaflet.
   * Parámetros: from=lon,lat y to=lon,lat
   */
  app.get("/api/maps/route", async (req: Request, res: Response) => {
    if (!requireGeoapify(res)) return;
    const from = parseLonLatPair(String(req.query.from ?? ""));
    const to = parseLonLatPair(String(req.query.to ?? ""));
    if (!from || !to) return res.status(400).json({ message: "Usa from=lon,lat y to=lon,lat" });
    const waypoints = `lonlat:${from.lon},${from.lat}|lonlat:${to.lon},${to.lat}`;
    try {
      const cacheKey = `ga|from=${from.lon.toFixed(5)},${from.lat.toFixed(5)}|to=${to.lon.toFixed(5)},${to.lat.toFixed(5)}`;
      const cached = cacheGet(routeCache, cacheKey);
      if (cached) return res.json(cached);

      const url = new URL(`${GEOAPIFY_BASE}/routing`);
      url.searchParams.set("waypoints", waypoints);
      url.searchParams.set("mode", "drive");
      url.searchParams.set("lang", "es");
      url.searchParams.set("units", "metric");
      url.searchParams.set("apiKey", GEOAPIFY_API_KEY);

      const r = await fetchWithTimeout(url.toString(), { headers: geoapifyHeaders() }, MAPS_ROUTE_FETCH_TIMEOUT_MS);
      if (!r.ok) {
        const snippet = await r.text().catch(() => "");
        console.warn(`[maps] Geoapify route HTTP ${r.status}${snippet ? `: ${snippet.slice(0, 200)}` : ""}`);
        const payload = fallbackRoute(from, to);
        cacheSet(routeCache, cacheKey, payload, 30_000);
        return res.json(payload);
      }
      const data = (await r.json()) as { features?: any[] };
      const feature = data.features?.[0];
      const props = feature?.properties && typeof feature.properties === "object" ? feature.properties : {};
      const geometry = mergeRouteGeometry(feature?.geometry);
      const distanceM = distanceMetersFromGeoapifyProps(props as Record<string, unknown>);
      const durationSec = Math.max(0, Math.round(Number((props as any).time) || 0));
      if (!geometry) {
        const payload = fallbackRoute(from, to);
        cacheSet(routeCache, cacheKey, payload, 30_000);
        return res.json(payload);
      }
      const payload = {
        distanceM,
        durationSec,
        geometry,
        source: "geoapify" as const,
      };
      cacheSet(routeCache, cacheKey, payload, ROUTE_CACHE_TTL_MS);
      res.json(payload);
    } catch (e) {
      console.error("[maps] route failed", e);
      const payload = fallbackRoute(from, to);
      cacheSet(
        routeCache,
        `fb|from=${from.lon.toFixed(5)},${from.lat.toFixed(5)}|to=${to.lon.toFixed(5)},${to.lat.toFixed(5)}`,
        payload,
        30_000
      );
      res.json(payload);
    }
  });
}

// Implementación anterior (Nominatim + OSRM + OpenRouteService): ver
// `server/routes-maps-legacy-before-geoapify.archive.txt` (no se importa).
