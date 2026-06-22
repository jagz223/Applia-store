/** Rutas Go donde el conductor ve ofertas en vivo (socket + modal). */
const DRIVER_VIEW_PATH_PREFIXES = [
  "/go/driver",
  "/go/taxi/driver",
  "/go/cargo/driver",
  "/go/delivery/driver",
  "/go/pack/driver",
] as const;

type UserGoPresence = {
  path: string;
  /** Pestaña/app en segundo plano o minimizada. */
  hidden: boolean;
  updatedAt: number;
};

const userGoPresence = new Map<string, UserGoPresence>();

export function updateUserGoPresence(
  userId: string,
  patch: { path?: string; hidden?: boolean },
): void {
  const uid = String(userId);
  const prev = userGoPresence.get(uid) ?? { path: "", hidden: false, updatedAt: 0 };
  userGoPresence.set(uid, {
    path: patch.path ?? prev.path,
    hidden: patch.hidden ?? prev.hidden,
    updatedAt: Date.now(),
  });
}

export function clearUserGoPresence(userId: string): void {
  userGoPresence.delete(String(userId));
}

export function getUserActivePath(userId: string): string | null {
  const path = userGoPresence.get(String(userId))?.path;
  return path ? path : null;
}

export function isUserOnDriverView(userId: string): boolean {
  const path = getUserActivePath(userId);
  if (!path) return false;
  return DRIVER_VIEW_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
}

export function isUserAppHidden(userId: string): boolean {
  return userGoPresence.get(String(userId))?.hidden === true;
}

/**
 * Push de oferta clásica al conductor si no tiene la app en primer plano en la vista driver.
 * - Sin presencia / desconectado → push.
 * - Fuera de vista driver → push.
 * - En vista driver pero minimizado/segundo plano → push.
 * - En vista driver y visible → no push (socket + modal).
 */
export function shouldSendDriverClassicOfferPush(userId: string): boolean {
  const uid = String(userId);
  const pres = userGoPresence.get(uid);
  if (!pres?.path) return true;
  if (!isUserOnDriverView(uid)) return true;
  return pres.hidden;
}
