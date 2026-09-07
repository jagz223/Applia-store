import type { StoreBranch } from "@shared/store-schema";

export type LatLon = { lat: number; lon: number };

/** Ring cerrado implícito (no hace falta repetir el primer vértice). */
export function isPointInPolygon(point: LatLon, ring: LatLon[]): boolean {
  if (ring.length < 3) return false;
  const x = point.lon;
  const y = point.lat;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].lon;
    const yi = ring[i].lat;
    const xj = ring[j].lon;
    const yj = ring[j].lat;
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function normalizeDeliveryPerimeter(value: unknown): LatLon[] | null {
  if (!Array.isArray(value)) return null;
  const out: LatLon[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const lat = Number(row.lat);
    const lon = Number(row.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;
    out.push({ lat, lon });
    if (out.length >= 80) break;
  }
  if (out.length < 3) return null;
  return out;
}

/**
 * Sin perímetro (≥3 vértices) no hay restricción.
 * Con perímetro, el punto debe quedar dentro del polígono.
 */
export function isDeliveryLocationInBranchPerimeter(
  branch: Pick<StoreBranch, "deliveryPerimeter"> | null | undefined,
  point: LatLon,
): boolean {
  const ring = normalizeDeliveryPerimeter(branch?.deliveryPerimeter ?? null);
  if (!ring) return true;
  return isPointInPolygon(point, ring);
}

export const STORE_DELIVERY_OUT_OF_PERIMETER_MESSAGE =
  "Esta ubicación está fuera del perímetro de delivery.";
