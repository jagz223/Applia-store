/** Tras un fallo de /api/maps/route, no volver a llamar hasta pasado este tiempo (misma ventana que caché servidor). */
export const ROUTE_FETCH_FAILURE_BACKOFF_MS = 30_000;

export type RouteFetchFailureStamp = {
  at: number;
  targetKey: string;
};

export function isRouteFetchInFailureBackoff(
  lastFailure: RouteFetchFailureStamp | null | undefined,
  targetKey: string,
  now = Date.now(),
): boolean {
  if (!lastFailure || lastFailure.targetKey !== targetKey) return false;
  return now - lastFailure.at < ROUTE_FETCH_FAILURE_BACKOFF_MS;
}
