import { useMemo } from "react";
import { Star } from "lucide-react";
import { normalizeGoPublicUserStats, type GoPublicUserStatsInput } from "@shared/go-public-user-stats";
import { cn } from "@/lib/utils";

type Props = GoPublicUserStatsInput & {
  className?: string;
  /** Tamaño compacto para paneles móviles del mapa. */
  compact?: boolean;
};

/**
 * Muestra estrellas y viajes solo cuando hay datos reales (no 5.0 por defecto sin reseñas).
 */
export function GoUserRideStatsBadges({ rating, ratingCount, completedTrips, className, compact }: Props) {
  const stats = useMemo(
    () => normalizeGoPublicUserStats({ rating, ratingCount, completedTrips }),
    [rating, ratingCount, completedTrips],
  );

  if (stats.rating == null && stats.completedTrips === 0) {
    return (
      <p className={cn("text-[11px] text-muted-foreground", className)}>Sin reseñas ni viajes previos en Go</p>
    );
  }

  const badge = compact
    ? "rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 text-[11px]"
    : "rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 text-xs";

  return (
    <div className={cn("flex flex-wrap items-center gap-2 text-muted-foreground", className)}>
      {stats.rating != null ? (
        <span
          className={cn("inline-flex items-center gap-1", badge)}
          title={
            stats.ratingCount > 0
              ? `${stats.rating.toFixed(1)} de 5 · ${stats.ratingCount} reseña${stats.ratingCount === 1 ? "" : "s"}`
              : undefined
          }
        >
          <Star className="h-3 w-3 text-amber-500" aria-hidden />
          <span className="font-medium text-foreground tabular-nums">{stats.rating.toFixed(1)}</span>
          {stats.ratingCount > 0 ? (
            <span className="tabular-nums text-muted-foreground">({stats.ratingCount})</span>
          ) : null}
        </span>
      ) : (
        <span className={cn(badge, "text-muted-foreground")}>Sin reseñas</span>
      )}
      {stats.completedTrips > 0 ? (
        <span className={badge}>
          <span className="font-medium text-foreground tabular-nums">{stats.completedTrips}</span> viaje
          {stats.completedTrips === 1 ? "" : "s"}
        </span>
      ) : null}
    </div>
  );
}
