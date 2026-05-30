import {
  isVisibilitySubscriptionWindowActive,
  parseVisibilitySubscriptionEndMs,
} from "./professional-listing-subscription";

/**
 * Política de publicación de tiendas:
 * - Sin `visibilitySubscriptionEndsAt` (null / vacío) → NO publicada en catálogo.
 * - Con fecha de fin en el pasado → inactiva.
 * - Con fecha vigente → visible en listado y accesible al público.
 *
 * A diferencia del listing profesional legacy, null no implica “sigue publicada”.
 */
export const STORE_VISIBILITY_REQUIRES_PAID_SUBSCRIPTION = true;

export function isStoreVisibilityActive(
  store: { visibilitySubscriptionEndsAt?: unknown },
  nowMs: number = Date.now(),
): boolean {
  const endMs = parseVisibilitySubscriptionEndMs(store.visibilitySubscriptionEndsAt);
  if (endMs == null) return false;
  return isVisibilitySubscriptionWindowActive(store.visibilitySubscriptionEndsAt, nowMs);
}
