/**
 * Viajes Go activos (searching / matched / in_progress) en Firestore.
 * Sobreviven reinicios y cold starts de Render; el historial terminado sigue en mobility_ride_history.
 */

import type { MobilityRideHistoryModule } from "@shared/mobility-ride-history";
import { getFirestore, isFirebaseConfigured, FIRESTORE_COLLECTIONS } from "./firebase-admin";

const COLLECTION = FIRESTORE_COLLECTIONS.MOBILITY_ACTIVE_RIDES;

export type ActiveMobilityRideStatus = "searching" | "matched" | "in_progress";

export type ActiveMobilityRidePayload = Record<string, unknown> & {
  id: string;
  status: string;
  riderUserId: string;
  driverUserId: string | null;
  currentOfferDriverId?: string | null;
  offerExpiresAt?: number | null;
  isNegotiated?: boolean;
};

type StoredActiveRideDoc = {
  module: MobilityRideHistoryModule;
  status: ActiveMobilityRideStatus;
  riderUserId: string;
  driverUserId: string | null;
  currentOfferDriverId: string | null;
  updatedAt: Date;
  payload: ActiveMobilityRidePayload;
};

const memoryActive = new Map<string, StoredActiveRideDoc>();
/** Evita que un persist async tardío reescriba Firestore tras cancelar/completar. */
const persistEpochByRideId = new Map<string, number>();

export function nextActiveMobilityRidePersistEpoch(rideId: string): number {
  const id = String(rideId ?? "").trim();
  if (!id) return 0;
  const next = (persistEpochByRideId.get(id) ?? 0) + 1;
  persistEpochByRideId.set(id, next);
  return next;
}

function isPersistEpochCurrent(rideId: string, epoch: number): boolean {
  const id = String(rideId ?? "").trim();
  if (!id) return false;
  return epoch === (persistEpochByRideId.get(id) ?? 0);
}

function isActiveStatus(status: string): status is ActiveMobilityRideStatus {
  return status === "searching" || status === "matched" || status === "in_progress";
}

/** Firestore no admite arrays anidados (GeoJSON, etc.). Serializamos esos campos. */
function serializePayloadForFirestore(ride: ActiveMobilityRidePayload): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(ride)) {
    if (value === undefined) continue;
    if (key === "routeGeometry") {
      if (value != null) out.routeGeometryJson = JSON.stringify(value);
      continue;
    }
    out[key] = sanitizeFirestoreValue(value);
  }
  return out;
}

function sanitizeFirestoreValue(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  if (Array.isArray(value)) {
    if (value.some((item) => Array.isArray(item))) {
      return JSON.stringify(value);
    }
    return value.map((item) => sanitizeFirestoreValue(item));
  }
  if (typeof value === "object") {
    const rec = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rec)) {
      if (v === undefined) continue;
      const next = sanitizeFirestoreValue(v);
      if (next !== undefined) out[k] = next;
    }
    return out;
  }
  return value;
}

function deserializePayloadFromFirestore(raw: Record<string, unknown>): ActiveMobilityRidePayload {
  const out: Record<string, unknown> = { ...raw };
  if (typeof out.routeGeometryJson === "string") {
    try {
      out.routeGeometry = JSON.parse(out.routeGeometryJson);
    } catch {
      out.routeGeometry = null;
    }
    delete out.routeGeometryJson;
  }
  return out as ActiveMobilityRidePayload;
}

function toStoredDoc(module: MobilityRideHistoryModule, ride: ActiveMobilityRidePayload): StoredActiveRideDoc | null {
  const status = String(ride.status ?? "");
  if (!isActiveStatus(status)) return null;
  return {
    module,
    status,
    riderUserId: String(ride.riderUserId ?? ""),
    driverUserId: ride.driverUserId != null ? String(ride.driverUserId) : null,
    currentOfferDriverId:
      ride.currentOfferDriverId != null && String(ride.currentOfferDriverId).trim()
        ? String(ride.currentOfferDriverId)
        : null,
    updatedAt: new Date(),
    payload: ride,
  };
}

function docFromFirestore(id: string, data: Record<string, unknown>): StoredActiveRideDoc | null {
  const module = data.module === "pack" ? "pack" : "cargo";
  const payload = data.payload;
  if (!payload || typeof payload !== "object") return null;
  const ridePayload = deserializePayloadFromFirestore({
    ...(payload as Record<string, unknown>),
    id,
  });
  const status = String(ridePayload.status ?? data.status ?? "");
  if (!isActiveStatus(status)) return null;
  return {
    module,
    status,
    riderUserId: String(data.riderUserId ?? ridePayload.riderUserId ?? ""),
    driverUserId:
      data.driverUserId != null
        ? String(data.driverUserId)
        : ridePayload.driverUserId != null
          ? String(ridePayload.driverUserId)
          : null,
    currentOfferDriverId:
      data.currentOfferDriverId != null && String(data.currentOfferDriverId).trim()
        ? String(data.currentOfferDriverId)
        : ridePayload.currentOfferDriverId != null && String(ridePayload.currentOfferDriverId).trim()
          ? String(ridePayload.currentOfferDriverId)
          : null,
    updatedAt:
      data.updatedAt && typeof data.updatedAt === "object" && "toDate" in data.updatedAt
        ? (data.updatedAt as { toDate: () => Date }).toDate()
        : new Date(),
    payload: ridePayload,
  };
}

/** Guarda o actualiza un viaje activo (no-op si el estado ya no es activo). */
export async function persistActiveMobilityRide(
  module: MobilityRideHistoryModule,
  ride: ActiveMobilityRidePayload,
  persistEpoch?: number,
): Promise<void> {
  const rideId = String(ride.id);
  const epochAtStart = persistEpoch ?? persistEpochByRideId.get(rideId) ?? 0;
  const doc = toStoredDoc(module, ride);
  if (!doc) {
    nextActiveMobilityRidePersistEpoch(rideId);
    await deleteActiveMobilityRide(rideId);
    return;
  }
  if (!isPersistEpochCurrent(rideId, epochAtStart)) return;
  memoryActive.set(rideId, doc);

  const db = getFirestore();
  if (!db) {
    if (!isFirebaseConfigured()) {
      console.warn("[mobility-active] Firebase no configurado; viajes activos solo en RAM.");
    }
    return;
  }

  try {
    if (!isPersistEpochCurrent(rideId, epochAtStart)) return;
    await db.collection(COLLECTION).doc(rideId).set({
      module: doc.module,
      status: doc.status,
      riderUserId: doc.riderUserId,
      driverUserId: doc.driverUserId,
      currentOfferDriverId: doc.currentOfferDriverId,
      updatedAt: doc.updatedAt,
      payload: serializePayloadForFirestore(doc.payload),
    });
  } catch (e) {
    console.error("[mobility-active] persist failed", ride.id, e);
  }
}

export async function deleteActiveMobilityRide(rideId: string): Promise<void> {
  const id = String(rideId ?? "").trim();
  if (!id) return;
  memoryActive.delete(id);

  const db = getFirestore();
  if (!db) return;

  try {
    await db.collection(COLLECTION).doc(id).delete();
  } catch (e) {
    console.error("[mobility-active] delete", id, e);
  }
}

export async function loadActiveMobilityRideById(
  rideId: string,
): Promise<{ module: MobilityRideHistoryModule; ride: ActiveMobilityRidePayload } | null> {
  const id = String(rideId ?? "").trim();
  if (!id) return null;

  const cached = memoryActive.get(id);
  if (cached) return { module: cached.module, ride: cached.payload };

  const db = getFirestore();
  if (!db) return null;

  const snap = await db.collection(COLLECTION).doc(id).get();
  if (!snap.exists) return null;
  const parsed = docFromFirestore(snap.id, snap.data() as Record<string, unknown>);
  if (!parsed) return null;
  memoryActive.set(id, parsed);
  return { module: parsed.module, ride: parsed.payload };
}

/** Carga todos los viajes activos (límite bajo: solo debería haber pocos en curso). */
export async function loadAllActiveMobilityRides(): Promise<
  Array<{ module: MobilityRideHistoryModule; ride: ActiveMobilityRidePayload }>
> {
  const db = getFirestore();
  if (!db) {
    return [...memoryActive.values()].map((d) => ({ module: d.module, ride: d.payload }));
  }

  const snap = await db.collection(COLLECTION).limit(300).get();
  const out: Array<{ module: MobilityRideHistoryModule; ride: ActiveMobilityRidePayload }> = [];
  for (const doc of snap.docs) {
    const parsed = docFromFirestore(doc.id, doc.data() as Record<string, unknown>);
    if (!parsed) {
      void deleteActiveMobilityRide(doc.id);
      continue;
    }
    memoryActive.set(doc.id, parsed);
    out.push({ module: parsed.module, ride: parsed.payload });
  }
  return out;
}

/** Busca oferta clásica pendiente para un conductor (fallback si RAM se perdió). */
export async function findActiveClassicOfferForDriver(
  module: MobilityRideHistoryModule,
  driverUserId: string,
): Promise<ActiveMobilityRidePayload | null> {
  const uid = String(driverUserId ?? "").trim();
  if (!uid) return null;

  const all = await loadAllActiveMobilityRides();
  const now = Date.now();
  for (const row of all) {
    if (row.module !== module) continue;
    const ride = row.ride;
    const status = String(ride.status ?? "");
    if (status !== "searching" || ride.isNegotiated) continue;
    if (ride.currentOfferDriverId !== uid) continue;
    const exp = ride.offerExpiresAt;
    if (typeof exp !== "number" || now > exp) continue;
    return ride;
  }
  return null;
}
