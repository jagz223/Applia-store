/** Estadísticas públicas de usuario en flujos Go (conductor ↔ pasajero). */

export type GoPublicUserStatsInput = {
  rating?: unknown;
  ratingCount?: unknown;
  completedTrips?: unknown;
};

export type GoPublicUserStats = {
  /** Promedio 1–5; `null` si aún no hay reseñas. */
  rating: number | null;
  ratingCount: number;
  /** Viajes completados (perfil + historial Go). */
  completedTrips: number;
};

export function normalizeGoPublicUserStats(
  input: GoPublicUserStatsInput,
  options?: { mobilityCompletedTrips?: number },
): GoPublicUserStats {
  const ratingCount = Math.max(0, Math.round(Number(input.ratingCount) || 0));
  const rawRating = Number(input.rating);
  const rating =
    ratingCount > 0 && Number.isFinite(rawRating) && rawRating >= 1 && rawRating <= 5
      ? Math.round(rawRating * 10) / 10
      : null;

  const profileTrips = Math.max(0, Math.round(Number(input.completedTrips) || 0));
  const historyTrips = Math.max(0, Math.round(Number(options?.mobilityCompletedTrips) || 0));
  const completedTrips = Math.max(profileTrips, historyTrips);

  return { rating, ratingCount, completedTrips };
}
