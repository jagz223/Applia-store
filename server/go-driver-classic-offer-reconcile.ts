/**
 * Re-oferta rides clásicos en `searching` sin conductor asignado (multi-servicio, FIFO).
 */
import type { Server as SocketIOServer } from "socket.io";
import type { ClassicOfferModule } from "./go-driver-classic-offer-lock";

export type StalledClassicSearchingRide = {
  rideId: string;
  module: ClassicOfferModule;
  createdAt: number;
};

type ClassicSearchingReconciler = {
  module: ClassicOfferModule;
  collectStalled: () => StalledClassicSearchingRide[];
  reconcileRide: (io: SocketIOServer, rideId: string) => Promise<void>;
};

const reconcilers: ClassicSearchingReconciler[] = [];

const RECONCILE_DEBOUNCE_MS = 350;
const RECONCILE_INTERVAL_MS = 20_000;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let reconcileInFlight = false;
let reconcileQueued = false;
let intervalStarted = false;

export function registerClassicSearchingReconciler(reconciler: ClassicSearchingReconciler): void {
  reconcilers.push(reconciler);
}

/** Coalesce ráfagas (decline, timeout, poll, presence) en un solo reconcile. */
export function scheduleReconcileSearchingClassicRides(io: SocketIOServer): void {
  if (debounceTimer) return;
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void reconcileSearchingClassicRides(io);
  }, RECONCILE_DEBOUNCE_MS);
}

/** Reintenta ofertar rides clásicos sin `currentOfferDriverId` (orden FIFO por `createdAt`). */
export async function reconcileSearchingClassicRides(io: SocketIOServer): Promise<void> {
  if (reconcileInFlight) {
    reconcileQueued = true;
    return;
  }
  reconcileInFlight = true;
  try {
    const stalled: StalledClassicSearchingRide[] = [];
    for (const r of reconcilers) {
      stalled.push(...r.collectStalled());
    }
    if (stalled.length === 0) return;

    stalled.sort((a, b) => a.createdAt - b.createdAt);

    for (const row of stalled) {
      const reconciler = reconcilers.find((r) => r.module === row.module);
      if (!reconciler) continue;
      try {
        await reconciler.reconcileRide(io, row.rideId);
      } catch (e) {
        console.error(`[classic-offer-reconcile] ${row.module} ride ${row.rideId}`, e);
      }
    }
  } finally {
    reconcileInFlight = false;
    if (reconcileQueued) {
      reconcileQueued = false;
      scheduleReconcileSearchingClassicRides(io);
    }
  }
}

/** Timer suave para rides atascados sin candidatos libres en un instante. */
export function startClassicOfferReconcileLoop(getIo: () => SocketIOServer | null): void {
  if (intervalStarted) return;
  intervalStarted = true;
  setInterval(() => {
    const io = getIo();
    if (!io) return;
    void reconcileSearchingClassicRides(io);
  }, RECONCILE_INTERVAL_MS);
}

/** Solo simulación / tests locales. */
export function resetClassicOfferReconcileForTests(): void {
  reconcilers.length = 0;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = null;
  reconcileInFlight = false;
  reconcileQueued = false;
}
