/**
 * Presencia unificada de conductores Go (taxi + delivery).
 * RAM caliente + Firestore para cold start / multi-instancia Render.
 * Escala O(n) en conductores *activos* recientes (típicamente << usuarios totales).
 */

import { getFirestore, isFirebaseConfigured, FIRESTORE_COLLECTIONS } from "./firebase-admin";

const COLLECTION = FIRESTORE_COLLECTIONS.GO_DRIVER_PRESENCE;

/** TTL lógico: sin heartbeat reciente = no disponible para matching. */
export const GO_DRIVER_PRESENCE_TTL_MS = 45_000;

/** Mínimo entre writes Firestore por conductor (reduce coste con 1000+ drivers). */
const FIRESTORE_WRITE_MIN_INTERVAL_MS = 10_000;

/** Máximo conductores frescos por consulta (margen sobre pico concurrente). */
const FIRESTORE_QUERY_LIMIT = 2500;

export type GoDriverPresenceRow = {
  userId: string;
  vehicleType: string;
  isPetFriendly: boolean;
  lat: number;
  lon: number;
  updatedAt: number;
  dispatchCompanyId: string | null;
  receivingTaxi: boolean;
  receivingDelivery: boolean;
  /** Taxi: dejó recibir pero sigue en viaje (mapa central). */
  idleOnMapTaxi: boolean;
  /** Delivery: dejó recibir pero sigue en viaje. */
  idleOnMapDelivery: boolean;
};

/** Vista legacy taxi (compat central / mobility-rides). */
export type TaxiDriverPresenceView = {
  userId: string;
  vehicleType: string;
  isPetFriendly: boolean;
  lat: number;
  lon: number;
  updatedAt: number;
  dispatchCompanyId: string | null;
  idleOnMapDuringRide?: boolean;
};

/** Vista legacy pack. */
export type PackDriverPresenceView = {
  userId: string;
  vehicleType: string;
  lat: number;
  lon: number;
  updatedAt: number;
  dispatchCompanyId: string | null;
  idleOnMapDuringRide?: boolean;
};

const memory = new Map<string, GoDriverPresenceRow>();
const lastFirestoreWriteAt = new Map<string, number>();
let lastFirestoreHydrateAt = 0;
const HYDRATE_COOLDOWN_MS = 8_000;

function emptyRow(userId: string): GoDriverPresenceRow {
  return {
    userId,
    vehicleType: "",
    isPetFriendly: false,
    lat: 0,
    lon: 0,
    updatedAt: 0,
    dispatchCompanyId: null,
    receivingTaxi: false,
    receivingDelivery: false,
    idleOnMapTaxi: false,
    idleOnMapDelivery: false,
  };
}

function isFresh(row: GoDriverPresenceRow, now = Date.now()): boolean {
  return row.updatedAt > 0 && now - row.updatedAt <= GO_DRIVER_PRESENCE_TTL_MS;
}

function rowFromFirestore(id: string, data: Record<string, unknown>): GoDriverPresenceRow {
  return {
    userId: id,
    vehicleType: String(data.vehicleType ?? "").trim(),
    isPetFriendly: !!data.isPetFriendly,
    lat: Number(data.lat) || 0,
    lon: Number(data.lon) || 0,
    updatedAt: Number(data.updatedAt) || 0,
    dispatchCompanyId:
      data.dispatchCompanyId != null && String(data.dispatchCompanyId).trim()
        ? String(data.dispatchCompanyId)
        : null,
    receivingTaxi: !!data.receivingTaxi,
    receivingDelivery: !!data.receivingDelivery,
    idleOnMapTaxi: !!data.idleOnMapTaxi,
    idleOnMapDelivery: !!data.idleOnMapDelivery,
  };
}

function serializeForFirestore(row: GoDriverPresenceRow): Record<string, unknown> {
  return {
    userId: row.userId,
    vehicleType: row.vehicleType,
    isPetFriendly: row.isPetFriendly,
    lat: row.lat,
    lon: row.lon,
    updatedAt: row.updatedAt,
    dispatchCompanyId: row.dispatchCompanyId,
    receivingTaxi: row.receivingTaxi,
    receivingDelivery: row.receivingDelivery,
    idleOnMapTaxi: row.idleOnMapTaxi,
    idleOnMapDelivery: row.idleOnMapDelivery,
  };
}

function shouldPersist(row: GoDriverPresenceRow): boolean {
  if (!row.updatedAt) return false;
  const active =
    row.receivingTaxi ||
    row.receivingDelivery ||
    row.idleOnMapTaxi ||
    row.idleOnMapDelivery;
  return active;
}

async function persistRow(row: GoDriverPresenceRow, force = false): Promise<void> {
  const id = row.userId;
  if (!shouldPersist(row)) {
    memory.delete(id);
    lastFirestoreWriteAt.delete(id);
    const db = getFirestore();
    if (db) {
      try {
        await db.collection(COLLECTION).doc(id).delete();
      } catch (e) {
        console.error("[go-presence] delete", id, e);
      }
    }
    return;
  }

  memory.set(id, row);

  const now = Date.now();
  const lastWrite = lastFirestoreWriteAt.get(id) ?? 0;
  if (!force && now - lastWrite < FIRESTORE_WRITE_MIN_INTERVAL_MS) return;

  const db = getFirestore();
  if (!db) return;

  try {
    await db.collection(COLLECTION).doc(id).set(serializeForFirestore(row));
    lastFirestoreWriteAt.set(id, now);
  } catch (e) {
    console.error("[go-presence] persist", id, e);
  }
}

/** Hidrata presencia fresca desde Firestore si la RAM está fría (post cold start). */
async function hydrateFreshFromFirestoreIfNeeded(): Promise<void> {
  const now = Date.now();
  if (memory.size > 0 && now - lastFirestoreHydrateAt < HYDRATE_COOLDOWN_MS) return;
  if (now - lastFirestoreHydrateAt < HYDRATE_COOLDOWN_MS && memory.size === 0) {
    /* primera carga tras arranque */
  } else if (memory.size > 0) {
    return;
  }

  const db = getFirestore();
  if (!db) return;

  lastFirestoreHydrateAt = now;
  const cutoff = now - GO_DRIVER_PRESENCE_TTL_MS;

  try {
    const snap = await db
      .collection(COLLECTION)
      .where("updatedAt", ">", cutoff)
      .limit(FIRESTORE_QUERY_LIMIT)
      .get();
    for (const doc of snap.docs) {
      const row = rowFromFirestore(doc.id, doc.data() as Record<string, unknown>);
      if (!isFresh(row, now)) continue;
      memory.set(row.userId, row);
    }
  } catch (e) {
    console.error("[go-presence] hydrate", e);
  }
}

function mergeRow(userId: string, patch: Partial<GoDriverPresenceRow>, forcePersist = false): GoDriverPresenceRow {
  const prev = memory.get(userId) ?? emptyRow(userId);
  const next: GoDriverPresenceRow = {
    ...prev,
    ...patch,
    userId,
    updatedAt: patch.updatedAt ?? Date.now(),
  };
  memory.set(userId, next);
  void persistRow(next, forcePersist);
  return next;
}

export function toTaxiPresenceView(row: GoDriverPresenceRow | undefined): TaxiDriverPresenceView | undefined {
  if (!row) return undefined;
  const visible = row.receivingTaxi || row.idleOnMapTaxi;
  if (!visible && !isFresh(row)) return undefined;
  if (!visible) return undefined;
  return {
    userId: row.userId,
    vehicleType: row.vehicleType,
    isPetFriendly: row.isPetFriendly,
    lat: row.lat,
    lon: row.lon,
    updatedAt: row.updatedAt,
    dispatchCompanyId: row.dispatchCompanyId,
    idleOnMapDuringRide: row.idleOnMapTaxi || undefined,
  };
}

export function toPackPresenceView(row: GoDriverPresenceRow | undefined): PackDriverPresenceView | undefined {
  if (!row) return undefined;
  const visible = row.receivingDelivery || row.idleOnMapDelivery;
  if (!visible && !isFresh(row)) return undefined;
  if (!visible) return undefined;
  return {
    userId: row.userId,
    vehicleType: row.vehicleType,
    lat: row.lat,
    lon: row.lon,
    updatedAt: row.updatedAt,
    dispatchCompanyId: row.dispatchCompanyId,
    idleOnMapDuringRide: row.idleOnMapDelivery || undefined,
  };
}

export function getGoDriverPresenceRow(userId: string): GoDriverPresenceRow | undefined {
  return memory.get(userId);
}

export function getTaxiPresenceRow(userId: string): TaxiDriverPresenceView | undefined {
  return toTaxiPresenceView(memory.get(userId));
}

export function getPackPresenceRow(userId: string): PackDriverPresenceView | undefined {
  return toPackPresenceView(memory.get(userId));
}

export function getMobilityOnlineDriversSnapshot(): ReadonlyMap<string, TaxiDriverPresenceView> {
  const out = new Map<string, TaxiDriverPresenceView>();
  for (const row of memory.values()) {
    const v = toTaxiPresenceView(row);
    if (v) out.set(row.userId, v);
  }
  return out;
}

export function getPackOnlineDriversSnapshot(): ReadonlyMap<string, PackDriverPresenceView> {
  const out = new Map<string, PackDriverPresenceView>();
  for (const row of memory.values()) {
    const v = toPackPresenceView(row);
    if (v) out.set(row.userId, v);
  }
  return out;
}

export type UpsertCargoPresenceInput = {
  userId: string;
  receiving: boolean;
  vehicleType: string;
  isPetFriendly: boolean;
  lat: number;
  lon: number;
  dispatchCompanyId: string | null;
  idleOnMapDuringRide?: boolean;
};

export function upsertCargoDriverPresence(input: UpsertCargoPresenceInput): TaxiDriverPresenceView {
  const prev = memory.get(input.userId);
  const receiving = !!input.receiving;
  const idle = !!input.idleOnMapDuringRide;
  const next = mergeRow(
    input.userId,
    {
      vehicleType: input.vehicleType || prev?.vehicleType || "car",
      isPetFriendly: input.isPetFriendly,
      lat: input.lat,
      lon: input.lon,
      dispatchCompanyId: input.dispatchCompanyId,
      receivingTaxi: receiving,
      idleOnMapTaxi: idle && !receiving,
      receivingDelivery: prev?.receivingDelivery ?? false,
      idleOnMapDelivery: prev?.idleOnMapDelivery ?? false,
    },
    receiving || idle,
  );
  return toTaxiPresenceView(next)!;
}

export type UpsertPackPresenceInput = {
  userId: string;
  receiving: boolean;
  vehicleType: string;
  lat: number;
  lon: number;
  dispatchCompanyId: string | null;
  idleOnMapDuringRide?: boolean;
};

export function upsertPackDriverPresence(input: UpsertPackPresenceInput): PackDriverPresenceView {
  const prev = memory.get(input.userId);
  const receiving = !!input.receiving;
  const idle = !!input.idleOnMapDuringRide;
  const next = mergeRow(
    input.userId,
    {
      vehicleType: input.vehicleType || prev?.vehicleType || "car",
      lat: input.lat,
      lon: input.lon,
      dispatchCompanyId: input.dispatchCompanyId,
      receivingDelivery: receiving,
      idleOnMapDelivery: idle && !receiving,
      receivingTaxi: prev?.receivingTaxi ?? false,
      idleOnMapTaxi: prev?.idleOnMapTaxi ?? false,
      isPetFriendly: prev?.isPetFriendly ?? false,
    },
    receiving || idle,
  );
  return toPackPresenceView(next)!;
}

/** Marca taxi offline; conserva delivery si aplica. */
export function clearCargoDriverPresence(userId: string, opts?: { idleOnMapDuringRide?: boolean }): void {
  const prev = memory.get(userId);
  if (!prev) return;
  const idle = !!opts?.idleOnMapDuringRide;
  if (idle) {
    mergeRow(userId, { receivingTaxi: false, idleOnMapTaxi: true }, true);
    return;
  }
  const next: GoDriverPresenceRow = {
    ...prev,
    receivingTaxi: false,
    idleOnMapTaxi: false,
    updatedAt: Date.now(),
  };
  if (next.receivingDelivery || next.idleOnMapDelivery) {
    void persistRow(next, true);
  } else {
    memory.delete(userId);
    void persistRow({ ...next, receivingDelivery: false, idleOnMapDelivery: false }, true);
  }
}

export function clearPackDriverPresence(userId: string, opts?: { idleOnMapDuringRide?: boolean }): void {
  const prev = memory.get(userId);
  if (!prev) return;
  const idle = !!opts?.idleOnMapDuringRide;
  if (idle) {
    mergeRow(userId, { receivingDelivery: false, idleOnMapDelivery: true }, true);
    return;
  }
  const next: GoDriverPresenceRow = {
    ...prev,
    receivingDelivery: false,
    idleOnMapDelivery: false,
    updatedAt: Date.now(),
  };
  if (next.receivingTaxi || next.idleOnMapTaxi) {
    void persistRow(next, true);
  } else {
    memory.delete(userId);
    void persistRow({ ...next, receivingTaxi: false, idleOnMapTaxi: false }, true);
  }
}

export function updateGoDriverPresenceLocation(
  userId: string,
  lat: number,
  lon: number,
  opts?: { idleOnMapTaxi?: boolean; idleOnMapDelivery?: boolean },
): void {
  const prev = memory.get(userId);
  if (!prev) return;
  mergeRow(userId, {
    lat,
    lon,
    idleOnMapTaxi: opts?.idleOnMapTaxi ?? prev.idleOnMapTaxi,
    idleOnMapDelivery: opts?.idleOnMapDelivery ?? prev.idleOnMapDelivery,
  });
}

export function updateGoDriverPresenceDispatchCompany(userId: string, dispatchCompanyId: string | null): void {
  const row = memory.get(userId);
  if (!row) return;
  if (dispatchCompanyId === row.dispatchCompanyId) return;
  mergeRow(userId, { dispatchCompanyId }, true);
}

export function isGoDriverPresenceFresh(userId: string): boolean {
  const row = memory.get(userId);
  return row ? isFresh(row) : false;
}

/** Lista conductores taxi disponibles para matching (RAM + fallback Firestore). */
export async function listFreshTaxiDriversForMatching(
  predicate: (row: TaxiDriverPresenceView) => boolean,
): Promise<TaxiDriverPresenceView[]> {
  if (memory.size === 0) await hydrateFreshFromFirestoreIfNeeded();
  const now = Date.now();
  const out: TaxiDriverPresenceView[] = [];
  for (const row of memory.values()) {
    if (!row.receivingTaxi || !isFresh(row, now)) continue;
    const view = toTaxiPresenceView(row);
    if (!view) continue;
    if (predicate(view)) out.push(view);
  }
  return out;
}

/** Lista conductores delivery disponibles para matching. */
export async function listFreshPackDriversForMatching(
  predicate: (row: PackDriverPresenceView) => boolean,
): Promise<PackDriverPresenceView[]> {
  if (memory.size === 0) await hydrateFreshFromFirestoreIfNeeded();
  const now = Date.now();
  const out: PackDriverPresenceView[] = [];
  for (const row of memory.values()) {
    if (!row.receivingDelivery || !isFresh(row, now)) continue;
    const view = toPackPresenceView(row);
    if (!view) continue;
    if (predicate(view)) out.push(view);
  }
  return out;
}

/** Arranque: cargar presencia reciente desde Firestore. */
export async function bootstrapGoDriverPresenceFromFirestore(): Promise<number> {
  if (!isFirebaseConfigured()) return 0;
  lastFirestoreHydrateAt = 0;
  memory.clear();
  await hydrateFreshFromFirestoreIfNeeded();
  return memory.size;
}

/** Socket disconnect: no borrar de golpe; dejar expirar por TTL salvo force. */
export function markGoDriverPresenceDisconnected(userId: string, opts?: { inActiveRide?: boolean }): void {
  const prev = memory.get(userId);
  if (!prev) return;
  if (opts?.inActiveRide) {
    mergeRow(userId, {
      receivingTaxi: false,
      receivingDelivery: false,
      idleOnMapTaxi: prev.receivingTaxi || prev.idleOnMapTaxi,
      idleOnMapDelivery: prev.receivingDelivery || prev.idleOnMapDelivery,
    });
    return;
  }
  mergeRow(userId, {
    receivingTaxi: false,
    receivingDelivery: false,
    idleOnMapTaxi: false,
    idleOnMapDelivery: false,
  });
}
