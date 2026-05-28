import { normalizeGoPublicUserStats, type GoPublicUserStats } from "@shared/go-public-user-stats";
import { countCompletedMobilityTripsForUser } from "./mobility-ride-history-store";
import { genFebStorage } from "./storage-genfeb";

const tripCountCache = new Map<string, { n: number; at: number }>();
const TRIP_CACHE_MS = 60_000;

function invalidateTripCountCache(userId: string): void {
  tripCountCache.delete(userId);
}

async function getMobilityCompletedTrips(userId: string): Promise<number> {
  const key = String(userId ?? "").trim();
  if (!key) return 0;
  const hit = tripCountCache.get(key);
  if (hit && Date.now() - hit.at < TRIP_CACHE_MS) return hit.n;
  const n = await countCompletedMobilityTripsForUser(key);
  tripCountCache.set(key, { n, at: Date.now() });
  return n;
}

/** Rating y viajes coherentes para paneles/modales Go. */
export async function resolveGoPublicUserStats(
  userId: string,
  rec: Record<string, unknown> | undefined,
): Promise<GoPublicUserStats> {
  const mobilityCompletedTrips = await getMobilityCompletedTrips(userId);
  return normalizeGoPublicUserStats(
    {
      rating: rec?.rating,
      ratingCount: rec?.ratingCount,
      completedTrips: rec?.completedTrips,
    },
    { mobilityCompletedTrips },
  );
}

/** Tras completar un viaje Go: incrementa contador en perfil (además del historial). */
export async function bumpGoUserCompletedTrips(userId: string): Promise<void> {
  const key = String(userId ?? "").trim();
  if (!key) return;
  try {
    const u = (await genFebStorage.getUserById(key)) as { completedTrips?: number } | undefined;
    const cur = typeof u?.completedTrips === "number" && Number.isFinite(u.completedTrips) ? u.completedTrips : 0;
    await genFebStorage.updateUser(key, { completedTrips: cur + 1 });
    invalidateTripCountCache(key);
  } catch (e) {
    console.warn("[go-public-user] bump completedTrips", key, e);
  }
}
