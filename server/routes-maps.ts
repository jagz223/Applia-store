import type { Express, Request, Response } from "express";
import { computeDrivingRoute } from "./maps-route-service";

const GEOAPIFY_API_KEY = String(
  process.env.GEOAPIFY_API_KEY ?? process.env.VITE_GEOAPIFY_API_KEY ?? ""
).trim();
const GEOAPIFY_BASE = "https://api.geoapify.com/v1";

const MAPS_USER_AGENT =
  process.env.MAPS_HTTP_USER_AGENT ||
  "Applia-CarGo/1.0 (mapa taxi; contacto: soporte applia)";

const MAPS_FETCH_TIMEOUT_MS = Number(process.env.MAPS_FETCH_TIMEOUT_MS || 11_000);

const REVERSE_CACHE_TTL_MS = 30 * 60_000;

type CacheEntry<T> = { expiresAt: number; value: T };
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
      const label = String(
        f?.properties?.formatted ??
          f?.properties?.address_line1 ??
          f?.properties?.street ??
          `${lat.toFixed(5)}, ${lon.toFixed(5)}`
      ).trim();
      /** Mantener el punto tocado en el mapa; Geoapify suele devolver el cruce/calle más cercano. */
      const payload = {
        lat,
        lon,
        label: label || `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
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
    try {
      const live = req.query.live === "1" || req.query.live === "true";
      const payload = await computeDrivingRoute(from, to, { live });
      if (payload.source === "fallback") {
        return res.status(502).json({
          message: "No se pudo trazar la ruta por calles. Intenta de nuevo.",
        });
      }
      res.json({
        distanceM: payload.distanceM,
        durationSec: payload.durationSec,
        geometry: payload.geometry,
        source: payload.source,
        fallback: false,
      });
    } catch (e) {
      console.error("[maps] route failed", e);
      res.status(502).json({ message: "No se pudo calcular la ruta" });
    }
  });
}

// Implementación anterior (Nominatim + OSRM + OpenRouteService): ver
// `server/routes-maps-legacy-before-geoapify.archive.txt` (no se importa).
