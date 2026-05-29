/** Paleta fija para distinguir conductores en el mapa de central (estable por userId). */
const FLEET_MARKER_COLORS = [
  "#0ea5e9",
  "#8b5cf6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
  "#06b6d4",
  "#84cc16",
  "#6366f1",
  "#f97316",
] as const;

function hashUserId(userId: string): number {
  let h = 5381;
  for (let i = 0; i < userId.length; i++) {
    h = (h * 33) ^ userId.charCodeAt(i);
  }
  return Math.abs(h);
}

/** Color estable por conductor para marcadores en mapa de central. */
export function fleetMapMarkerColorForUser(userId: string): string {
  return FLEET_MARKER_COLORS[hashUserId(userId) % FLEET_MARKER_COLORS.length]!;
}
