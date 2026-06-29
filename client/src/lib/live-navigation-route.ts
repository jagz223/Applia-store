/** Metros fuera de la polyline para recalcular ruta por calles (desvío). */
export const LIVE_ROUTE_DEVIATION_M = 30;
/** Mínimo entre recálculos por desvío. */
export const LIVE_ROUTE_DEVIATION_REFETCH_MS = 2_500;
/** Recálculo periódico aunque el conductor siga la ruta (ETA y geometría al día). */
export const LIVE_ROUTE_PERIODIC_REFETCH_MS = 8_000;

export function shouldRecalcLiveRoute(input: {
  force?: boolean;
  routeMissing: boolean;
  targetChanged: boolean;
  deviationM: number;
  lastFetch: { at: number; targetKey: string } | null;
  targetKey: string;
  now?: number;
}): boolean {
  const now = input.now ?? Date.now();
  if (input.force || input.routeMissing || input.targetChanged) return true;
  const sameTarget = input.lastFetch?.targetKey === input.targetKey;
  const sinceLast = sameTarget && input.lastFetch ? now - input.lastFetch.at : Number.POSITIVE_INFINITY;
  if (input.deviationM >= LIVE_ROUTE_DEVIATION_M && sinceLast >= LIVE_ROUTE_DEVIATION_REFETCH_MS) {
    return true;
  }
  if (sinceLast >= LIVE_ROUTE_PERIODIC_REFETCH_MS) return true;
  return false;
}

export function buildLiveMapsRouteUrl(
  from: { lon: number; lat: number },
  to: { lon: number; lat: number },
): string {
  const fromQ = `${from.lon},${from.lat}`;
  const toQ = `${to.lon},${to.lat}`;
  return `/api/maps/route?from=${encodeURIComponent(fromQ)}&to=${encodeURIComponent(toQ)}&live=1`;
}
