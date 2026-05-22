import type {
  MobilityRideHistoryModule,
  MobilityRideHistoryOutcome,
} from "@shared/mobility-ride-history";
import { archiveMobilityRideHistory } from "./mobility-ride-history-store";

export type RideArchiveSource = {
  id: string;
  riderUserId: string;
  driverUserId: string | null;
  status: string;
  vehicleType: string;
  paymentMethod: string;
  estimatedUsd: number;
  suggestedUsd?: number;
  distanceM: number;
  durationSec: number;
  start: { lat: number; lon: number; label: string };
  end: { lat: number; lon: number; label: string };
  createdAt: number;
};

/** Persiste un viaje terminado (completado, cancelado o expirado) en Firestore. */
export async function persistMobilityRideToHistory(
  ride: RideArchiveSource,
  module: MobilityRideHistoryModule,
  outcome: MobilityRideHistoryOutcome,
  extra?: {
    cancelledBy?: "rider" | "driver";
    failReason?: "timeout" | "no_driver";
  }
): Promise<void> {
  try {
    await archiveMobilityRideHistory({
      id: ride.id,
      module,
      outcome,
      rawStatus: ride.status,
      riderUserId: ride.riderUserId,
      driverUserId: ride.driverUserId,
      cancelledBy: extra?.cancelledBy ?? null,
      failReason: extra?.failReason ?? null,
      vehicleType: ride.vehicleType,
      paymentMethod: ride.paymentMethod,
      estimatedUsd: ride.estimatedUsd,
      suggestedUsd: ride.suggestedUsd,
      distanceM: ride.distanceM,
      durationSec: ride.durationSec,
      start: ride.start,
      end: ride.end,
      createdAt: ride.createdAt,
    });
  } catch (e) {
    console.error(`[${module}] persist ride history`, e);
  }
}
