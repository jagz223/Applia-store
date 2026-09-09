import type { MobilityRideHistoryListItem } from "@shared/mobility-ride-history";
import type { TaxiDriverTripLog } from "@/lib/taxi-driver-storage";
import type { TaxiRiderTripLog } from "@/lib/taxi-rider-trip-log";

export function historyToDriverTripLog(row: MobilityRideHistoryListItem): TaxiDriverTripLog {
  return {
    id: row.id,
    endedAt: row.endedAt,
    durationMin: row.durationMin,
    amountUsd: row.amountUsd,
    payment: row.payment,
    goSlug: row.module === "pack" ? "pack" : "taxi",
    outcome: row.outcome,
    statusLabel: row.statusLabel,
    destinationPending: row.destinationPending === true,
  };
}

export function historyToRiderTripLog(row: MobilityRideHistoryListItem): TaxiRiderTripLog & {
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
    goSlug: row.module === "pack" ? "pack" : "taxi",
    outcome: row.outcome,
    statusLabel: row.statusLabel,
  };
}
