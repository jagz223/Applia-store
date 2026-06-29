/** Tras un fallo de /api/maps/route, reintento breve para no congelar la navegación. */
export const ROUTE_FETCH_FAILURE_BACKOFF_MS = 5_000;

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
