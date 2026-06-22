import type { GeoJsonObject } from "geojson";
import {
  buildStoredDrivingRoute,
  geoJsonLineFromCoords,
  isRoadRouteApiPayload,
} from "@/lib/driving-route-geometry";

export type RoadDrivingRouteResult = {
  geometry: GeoJsonObject;
  distanceM: number;
  durationSec: number;
};

/** Mismo estilo de polyline que Car Go / Pack Go en TaxiRouteMap. */
export const ROAD_ROUTE_MAP_STYLE = {
  color: "#2563eb",
  weight: 5,
  opacity: 0.88,
} as const;

type RouteApiBody = {
  distanceM?: number;
  durationSec?: number;
  geometry?: unknown;
  source?: string;
  fallback?: boolean;
  message?: string;
} | null;

async function parseRoadRouteResponse(
  res: Response,
): Promise<{ route: RoadDrivingRouteResult | null; errorMessage: string | null }> {
  const body = (await res.json().catch(() => null)) as RouteApiBody;
  if (!res.ok) {
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    return {
      route: null,
      errorMessage: message || "No se pudo trazar la ruta por calles. Intenta de nuevo.",
    };
  }
  if (!body || !isRoadRouteApiPayload(body) || typeof body.distanceM !== "number") {
    return { route: null, errorMessage: "No se pudo trazar la ruta por calles. Intenta de nuevo." };
  }
  const stored = buildStoredDrivingRoute(
    body.geometry,
    "road",
    body.distanceM,
    body.durationSec ?? 60,
  );
  if (!stored) {
    return { route: null, errorMessage: "No se pudo trazar la ruta por calles. Intenta de nuevo." };
  }
  const geometry = geoJsonLineFromCoords(stored.coords);
  if (!geometry) {
    return { route: null, errorMessage: "No se pudo trazar la ruta por calles. Intenta de nuevo." };
  }
  return {
    route: {
      geometry,
      distanceM: body.distanceM,
      durationSec: body.durationSec ?? 60,
    },
    errorMessage: null,
  };
}

export type FetchRoadDrivingRouteResult = {
  route: RoadDrivingRouteResult | null;
  errorMessage: string | null;
};

/**
 * Ruta en coche vía GET /api/maps/route (Geoapify).
 * Un solo intento por llamada; solo reintenta si falla la red (no en 502 de ruta inválida).
 */
export async function fetchRoadDrivingRoute(
  start: { lat: number; lon: number },
  end: { lat: number; lon: number },
): Promise<FetchRoadDrivingRouteResult> {
  const from = `${start.lon},${start.lat}`;
  const to = `${end.lon},${end.lat}`;
  const url = `/api/maps/route?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

  const tryFetch = () => parseRoadRouteResponse(fetch(url));

  try {
    const parsed = await tryFetch();
    if (parsed.route) return parsed;
    return parsed;
  } catch {
    await new Promise((r) => window.setTimeout(r, 1200));
    try {
      return await tryFetch();
    } catch {
      return {
        route: null,
        errorMessage: "No se pudo conectar al servicio de rutas. Revisa tu red e intenta otra vez.",
      };
    }
  }
}
