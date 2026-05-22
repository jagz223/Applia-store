import type { MobilityRideHistoryListItem } from "@shared/mobility-ride-history";
import type { CargoDriverTripLog } from "@/lib/cargo-driver-storage";
import type { CargoRiderTripLog } from "@/lib/cargo-rider-trip-log";

export function historyToDriverTripLog(row: MobilityRideHistoryListItem): CargoDriverTripLog {
  return {
    id: row.id,
    endedAt: row.endedAt,
    durationMin: row.durationMin,
    amountUsd: row.amountUsd,
    payment: row.payment,
    goSlug: row.module === "pack" ? "pack" : "cargo",
    outcome: row.outcome,
    statusLabel: row.statusLabel,
  };
}

export function historyToRiderTripLog(row: MobilityRideHistoryListItem): CargoRiderTripLog & {
  outcome: MobilityRideHistoryListItem["outcome"];
  statusLabel: string;
} {
  return {
    id: row.id,
    endedAt: row.endedAt,
    durationMin: row.durationMin,
    amountUsd: row.amountUsd,
    payment: row.payment,
    driverName: row.driverName ?? "—",
    goSlug: row.module === "pack" ? "pack" : "cargo",
    outcome: row.outcome,
    statusLabel: row.statusLabel,
  };
}
