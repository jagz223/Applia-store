/** Historial persistente de viajes Car Go / Pack Go (completados, cancelados, expirados). */

export type MobilityRideHistoryModule = "cargo" | "pack";

export type MobilityRideHistoryOutcome = "completed" | "cancelled" | "expired";

export type MobilityRideHistoryRecord = {
  id: string;
  module: MobilityRideHistoryModule;
  outcome: MobilityRideHistoryOutcome;
  /** Estado en memoria al archivar (searching, matched, in_progress, cancelled, expired). */
  rawStatus: string;
  riderUserId: string;
  driverUserId: string | null;
  participantUserIds: string[];
  cancelledBy?: "rider" | "driver" | null;
  failReason?: "timeout" | "no_driver" | null;
  vehicleType: string;
  paymentMethod: string;
  estimatedUsd: number;
  suggestedUsd?: number | null;
  distanceM: number;
  durationSec: number;
  startLabel: string;
  endLabel: string;
  startLat: number;
  startLon: number;
  endLat: number;
  endLon: number;
  riderName: string;
  driverName: string | null;
  createdAt: string;
  endedAt: string;
};

export type MobilityRideHistoryListItem = {
  id: string;
  module: MobilityRideHistoryModule;
  outcome: MobilityRideHistoryOutcome;
  statusLabel: string;
  riderName: string;
  driverName: string | null;
  vehicleLabel: string;
  startLabel: string;
  endLabel: string;
  createdAt: string;
  endedAt: string;
  durationMin: number;
  amountUsd: number;
  payment: "genfeb" | "cash" | "bank_transfer";
  cancelledBy?: "rider" | "driver" | null;
};

export function mobilityHistoryStatusLabel(
  outcome: MobilityRideHistoryOutcome,
  cancelledBy?: "rider" | "driver" | null
): string {
  if (outcome === "completed") return "Completado";
  if (outcome === "expired") return "Expirado (sin viaje)";
  if (outcome === "cancelled") {
    if (cancelledBy === "driver") return "Cancelado por conductor";
    if (cancelledBy === "rider") return "Cancelado por pasajero";
    return "Cancelado";
  }
  return outcome;
}

export function mobilityHistoryAdminBucket(
  outcome: MobilityRideHistoryOutcome
): "completed" | "cancelled" {
  return outcome === "completed" ? "completed" : "cancelled";
}
