import { haversineM } from "@shared/maps-route-math";
import type { StoreBranch, StoreDeliveryAvoidSegment } from "@shared/store-schema";
import { STORE_DELIVERY_AVOID_SEGMENTS_MAX } from "@shared/store-schema";

export type LatLon = { lat: number; lon: number };

/** Espaciado aprox. entre puntos de exclusión a lo largo del tramo. */
const AVOID_SAMPLE_SPACING_M = 55;
/** Tope de puntos enviados a Geoapify (evita URLs/créditos excesivos). */
export const STORE_DELIVERY_AVOID_LOCATIONS_MAX = 48;

export function normalizeDeliveryAvoidSegments(
  value: unknown,
): StoreDeliveryAvoidSegment[] | null {
  if (!Array.isArray(value)) return null;
  const out: StoreDeliveryAvoidSegment[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const aRaw = row.a;
    const bRaw = row.b;
    if (!aRaw || typeof aRaw !== "object" || !bRaw || typeof bRaw !== "object") continue;
    const aLat = Number((aRaw as Record<string, unknown>).lat);
    const aLon = Number((aRaw as Record<string, unknown>).lon);
    const bLat = Number((bRaw as Record<string, unknown>).lat);
    const bLon = Number((bRaw as Record<string, unknown>).lon);
    if (
      !Number.isFinite(aLat) ||
      !Number.isFinite(aLon) ||
      !Number.isFinite(bLat) ||
      !Number.isFinite(bLon)
    ) {
      continue;
    }
    if (aLat === bLat && aLon === bLon) continue;
    let id = String(row.id ?? "").trim();
    if (!id || seen.has(id)) id = `avs_${out.length}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      a: { lat: aLat, lon: aLon },
      b: { lat: bLat, lon: bLon },
      ...(Array.isArray(row.path)
        ? {
            path: (row.path as unknown[])
              .map((pr) => {
                if (!pr || typeof pr !== "object") return null;
                const lat = Number((pr as Record<string, unknown>).lat);
                const lon = Number((pr as Record<string, unknown>).lon);
                if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
                return { lat, lon };
              })
              .filter((p): p is LatLon => p != null)
              .slice(0, 100),
          }
        : {}),
    });
    if (out.length >= STORE_DELIVERY_AVOID_SEGMENTS_MAX) break;
  }
  return out.length > 0
    ? out.map((s) =>
        s.path && s.path.length >= 2 ? s : { id: s.id, a: s.a, b: s.b },
      )
    : null;
}

/**
 * Muestrea puntos a lo largo de cada tramo para `avoid=location:…` de Geoapify.
 * Preferencia suave: si no hay alternativa, la ruta igual puede pasar.
 */
export function expandAvoidSegmentsToLocations(
  segments: StoreDeliveryAvoidSegment[] | null | undefined,
  maxLocations = STORE_DELIVERY_AVOID_LOCATIONS_MAX,
): LatLon[] {
  const list = segments ?? [];
  if (list.length === 0 || maxLocations <= 0) return [];
  const out: LatLon[] = [];
  const seen = new Set<string>();

  function push(p: LatLon) {
    const key = `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(p);
  }

  function samplePolyline(pts: LatLon[]) {
    if (pts.length === 0) return;
    push(pts[0]!);
    for (let i = 1; i < pts.length && out.length < maxLocations; i += 1) {
      const prev = pts[i - 1]!;
      const cur = pts[i]!;
      const dist = haversineM(prev, cur);
      const steps = Math.max(1, Math.ceil(dist / AVOID_SAMPLE_SPACING_M));
      for (let s = 1; s <= steps && out.length < maxLocations; s += 1) {
        const t = s / steps;
        push({
          lat: prev.lat + (cur.lat - prev.lat) * t,
          lon: prev.lon + (cur.lon - prev.lon) * t,
        });
      }
    }
  }

  for (const seg of list) {
    if (out.length >= maxLocations) break;
    const poly =
      seg.path && seg.path.length >= 2 ? seg.path : ([seg.a, seg.b] as LatLon[]);
    samplePolyline(poly);
  }
  return out;
}

export function branchAvoidLocations(
  branch: Pick<StoreBranch, "deliveryAvoidSegments"> | null | undefined,
): LatLon[] {
  return expandAvoidSegmentsToLocations(branch?.deliveryAvoidSegments ?? null);
}

/** Formato query Geoapify Routing: `location:lat,lon|location:…` */
export function formatGeoapifyAvoidLocationsParam(points: LatLon[]): string {
  if (points.length === 0) return "";
  return points.map((p) => `location:${p.lat.toFixed(6)},${p.lon.toFixed(6)}`).join("|");
}

export function avoidLocationsFingerprint(points: LatLon[]): string {
  return points.map((p) => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`).join(";");
}
