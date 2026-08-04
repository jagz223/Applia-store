/**
 * Política de publicación de tiendas.
 * La tienda única del sistema está siempre activa (sin mensualidad / sin estado inactivo).
 */
export const STORE_VISIBILITY_REQUIRES_PAID_SUBSCRIPTION = false;

export function isStoreVisibilityActive(
  _store?: { visibilitySubscriptionEndsAt?: unknown },
  _nowMs: number = Date.now(),
): boolean {
  return true;
}
