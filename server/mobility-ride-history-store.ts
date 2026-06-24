/**
 * Persistencia del historial de viajes Go (Car Go / Pack Go).
 * Completados y cancelados/expirados se guardan en Firestore (o memoria de respaldo en dev).
 */

import {
  mobilityHistoryAdminBucket,
  mobilityHistoryStatusLabel,
  type MobilityRideHistoryListItem,
  type MobilityRideHistoryModule,
  type MobilityRideHistoryOutcome,
  type MobilityRideHistoryRecord,
} from "@shared/mobility-ride-history";
import { getFirestore, FIRESTORE_COLLECTIONS } from "./firebase-admin";
import { genFebStorage } from "./storage-genfeb";

const COLLECTION = FIRESTORE_COLLECTIONS.MOBILITY_RIDE_HISTORY;

/** Respaldo en proceso cuando Firebase no está configurado (solo dev). */
const memoryHistory = new Map<string, MobilityRideHistoryRecord>();

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (v && typeof v === "object" && "toDate" in v && typeof (v as { toDate: () => Date }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof v === "string") {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return new Date().toISOString();
}

function docToRecord(id: string, data: Record<string, unknown>): MobilityRideHistoryRecord {
  const participants = Array.isArray(data.participantUserIds)
    ? (data.participantUserIds as string[]).filter((x) => typeof x === "string")
    : [];
  return {
    id,
    module: (data.module === "pack" ? "pack" : "cargo") as MobilityRideHistoryModule,
    outcome: (["completed", "cancelled", "expired"].includes(String(data.outcome))
      ? data.outcome
      : "cancelled") as MobilityRideHistoryOutcome,
    rawStatus: String(data.rawStatus ?? ""),
    riderUserId: String(data.riderUserId ?? ""),
    driverUserId: data.driverUserId != null ? String(data.driverUserId) : null,
    participantUserIds: participants,
    cancelledBy:
      data.cancelledBy === "rider" || data.cancelledBy === "driver" ? data.cancelledBy : null,
    failReason:
      data.failReason === "timeout" || data.failReason === "no_driver" ? data.failReason : null,
    vehicleType: String(data.vehicleType ?? ""),
    paymentMethod: String(data.paymentMethod ?? ""),
    estimatedUsd: Number(data.estimatedUsd) || 0,
    suggestedUsd: data.suggestedUsd != null ? Number(data.suggestedUsd) : null,
    distanceM: Number(data.distanceM) || 0,
    durationSec: Number(data.durationSec) || 0,
    startLabel: String(data.startLabel ?? ""),
    endLabel: String(data.endLabel ?? ""),
    startLat: Number(data.startLat) || 0,
    startLon: Number(data.startLon) || 0,
    endLat: Number(data.endLat) || 0,
    endLon: Number(data.endLon) || 0,
    destinationPending: data.destinationPending === true,
    riderName: String(data.riderName ?? "Pasajero"),
    driverName: data.driverName != null ? String(data.driverName) : null,
    createdAt: toIso(data.createdAt),
    endedAt: toIso(data.endedAt),
  };
}

function mapPayment(method: string): "genfeb" | "cash" | "bank_transfer" {
  if (method === "genfeb") return "genfeb";
  if (method === "bank_transfer") return "bank_transfer";
  return "cash";
}

function toListItem(r: MobilityRideHistoryRecord): MobilityRideHistoryListItem {
  const vehicleLabels: Record<string, string> = {
    moto: "Moto",
    auto: "Auto",
    pet_car: "Pet Car",
    camioneta: "Camioneta",
    motorcycle: "Moto",
    car: "Auto",
    pickup_truck: "Camioneta",
    truck: "Camión",
  };
  return {
    id: r.id,
    module: r.module,
    outcome: r.outcome,
    statusLabel: mobilityHistoryStatusLabel(r.outcome, r.cancelledBy ?? undefined),
    riderName: r.riderName,
    driverName: r.driverName,
    vehicleLabel: vehicleLabels[r.vehicleType] ?? r.vehicleType,
    startLabel: r.destinationPending ? r.startLabel : r.startLabel,
    endLabel: r.destinationPending ? "Sin destino" : r.endLabel,
    createdAt: r.createdAt,
    endedAt: r.endedAt,
    durationMin: r.destinationPending ? 0 : Math.max(1, Math.round(r.durationSec / 60)),
    amountUsd: r.destinationPending ? 0 : r.estimatedUsd,
    payment: mapPayment(r.paymentMethod),
    cancelledBy: r.cancelledBy ?? undefined,
    destinationPending: r.destinationPending === true,
  };
}

async function resolveDisplayName(userId: string): Promise<string> {
  const u = (await genFebStorage.getUserById(userId)) as Record<string, unknown> | undefined;
  if (!u) return "Usuario";
  const fn = String(u.firstName ?? u.name ?? "").trim();
  const ln = String(u.lastName ?? "").trim();
  const joined = [fn, ln].filter(Boolean).join(" ").trim();
  return joined || String(u.email ?? "Usuario");
}

export type ArchiveMobilityRideInput = {
  id: string;
  module: MobilityRideHistoryModule;
  outcome: MobilityRideHistoryOutcome;
  rawStatus: string;
  riderUserId: string;
  driverUserId: string | null;
  cancelledBy?: "rider" | "driver" | null;
  failReason?: "timeout" | "no_driver" | null;
  vehicleType: string;
  paymentMethod: string;
  estimatedUsd: number;
  suggestedUsd?: number;
  distanceM: number;
  durationSec: number;
  start: { lat: number; lon: number; label: string };
  end: { lat: number; lon: number; label: string } | null;
  destinationPending?: boolean;
  createdAt: number;
};

/** Guarda un viaje terminado de forma idempotente (misma clave = ride id). */
export async function archiveMobilityRideHistory(input: ArchiveMobilityRideInput): Promise<void> {
  const endedAt = new Date().toISOString();
  const participantUserIds = input.driverUserId
    ? [input.riderUserId, input.driverUserId]
    : [input.riderUserId];

  const [riderName, driverName] = await Promise.all([
    resolveDisplayName(input.riderUserId),
    input.driverUserId ? resolveDisplayName(input.driverUserId) : Promise.resolve(null),
  ]);

  const destinationPending = !!input.destinationPending;
  const endPoint = input.end ?? input.start;

  const record: MobilityRideHistoryRecord = {
    id: input.id,
    module: input.module,
    outcome: input.outcome,
    rawStatus: input.rawStatus,
    riderUserId: input.riderUserId,
    driverUserId: input.driverUserId,
    participantUserIds,
    cancelledBy: input.cancelledBy ?? null,
    failReason: input.failReason ?? null,
    vehicleType: input.vehicleType,
    paymentMethod: input.paymentMethod,
    estimatedUsd: destinationPending ? 0 : input.estimatedUsd,
    suggestedUsd: destinationPending ? null : (input.suggestedUsd ?? null),
    distanceM: destinationPending ? 0 : input.distanceM,
    durationSec: destinationPending ? 0 : input.durationSec,
    startLabel: input.start.label,
    endLabel: destinationPending ? "Sin destino" : endPoint.label,
    startLat: input.start.lat,
    startLon: input.start.lon,
    endLat: destinationPending ? 0 : endPoint.lat,
    endLon: destinationPending ? 0 : endPoint.lon,
    destinationPending,
    riderName,
    driverName,
    createdAt: new Date(input.createdAt).toISOString(),
    endedAt,
  };

  memoryHistory.set(record.id, record);

  const db = getFirestore();
  if (!db) {
    console.warn("[mobility-ride-history] Firebase no configurado; historial solo en memoria del proceso.");
    return;
  }

  await db.collection(COLLECTION).doc(record.id).set(
    {
      ...record,
      createdAt: new Date(record.createdAt),
      endedAt: new Date(record.endedAt),
    },
    { merge: true }
  );
}

async function loadAllFromMemory(): Promise<MobilityRideHistoryRecord[]> {
  return [...memoryHistory.values()].sort((a, b) => b.endedAt.localeCompare(a.endedAt));
}

async function loadAllFromFirestore(): Promise<MobilityRideHistoryRecord[]> {
  const db = getFirestore();
  if (!db) return loadAllFromMemory();
  const snap = await db.collection(COLLECTION).orderBy("endedAt", "desc").limit(2000).get();
  return snap.docs.map((d) => docToRecord(d.id, d.data() as Record<string, unknown>));
}

async function loadForUserFromFirestore(userId: string, limit: number): Promise<MobilityRideHistoryRecord[]> {
  const db = getFirestore();
  if (!db) {
    const all = await loadAllFromMemory();
    return all
      .filter((r) => r.participantUserIds.includes(userId))
      .slice(0, limit);
  }
  // array-contains + orderBy exige índice compuesto en Firestore; ordenamos en memoria (límite ≤ 200).
  const fetchLimit = Math.min(500, Math.max(limit * 3, limit));
  const snap = await db
    .collection(COLLECTION)
    .where("participantUserIds", "array-contains", userId)
    .limit(fetchLimit)
    .get();
  const rows = snap.docs.map((d) => docToRecord(d.id, d.data() as Record<string, unknown>));
  rows.sort((a, b) => b.endedAt.localeCompare(a.endedAt));
  return rows.slice(0, limit);
}

/** Viajes Go terminados con éxito (Car Go + Pack Go) en los que participó el usuario. */
export async function countCompletedMobilityTripsForUser(userId: string): Promise<number> {
  const key = String(userId ?? "").trim();
  if (!key) return 0;
  const rows = await loadForUserFromFirestore(key, 500);
  return rows.filter((r) => r.outcome === "completed").length;
}

export async function listMobilityRideHistoryForUser(
  userId: string,
  options?: { limit?: number; role?: "rider" | "driver" }
): Promise<MobilityRideHistoryListItem[]> {
  const limit = Math.min(200, Math.max(1, options?.limit ?? 50));
  const rows = await loadForUserFromFirestore(userId, limit);
  const role = options?.role;
  const filtered =
    role === "driver"
      ? rows.filter((r) => r.driverUserId === userId)
      : role === "rider"
        ? rows.filter((r) => r.riderUserId === userId)
        : rows;
  return filtered.map(toListItem);
}

export type AdminCargoGoHistoryBucket = "completed" | "cancelled";

export async function listMobilityRideHistoryForAdmin(
  bucket: AdminCargoGoHistoryBucket
): Promise<MobilityRideHistoryListItem[]> {
  const all = await loadAllFromFirestore();
  return all
    .filter((r) => mobilityHistoryAdminBucket(r.outcome) === bucket)
    .map(toListItem);
}

export async function countMobilityRideHistoryByOutcome(): Promise<{
  completed: number;
  cancelled: number;
}> {
  const all = await loadAllFromFirestore();
  let completed = 0;
  let cancelled = 0;
  for (const r of all) {
    if (mobilityHistoryAdminBucket(r.outcome) === "completed") completed++;
    else cancelled++;
  }
  return { completed, cancelled };
}

/** Conductores (userId) vinculados a una central vía proveedor. */
export async function getDispatchCompanyDriverUserIds(companyId: string): Promise<Set<string>> {
  const cid = String(companyId ?? "").trim();
  const ids = new Set<string>();
  if (!cid) return ids;
  const providers = await genFebStorage.getAllProviders();
  for (const p of providers ?? []) {
    if (String((p as { dispatchCompanyId?: string }).dispatchCompanyId ?? "") !== cid) continue;
    const uid = String((p as { userId?: string }).userId ?? "").trim();
    if (uid) ids.add(uid);
  }
  return ids;
}

export type CentralCargoGoHistoryPage = {
  rides: MobilityRideHistoryListItem[];
  bucket: AdminCargoGoHistoryBucket;
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  counts: { completed: number; cancelled: number };
};

/** Historial Car Go / Pack de conductores afiliados a la central (completados y cancelados). */
export async function listMobilityRideHistoryForCentral(
  companyId: string,
  bucket: AdminCargoGoHistoryBucket,
  options: { page: number; limit: number },
): Promise<CentralCargoGoHistoryPage> {
  const driverIds = await getDispatchCompanyDriverUserIds(companyId);
  const all = await loadAllFromFirestore();
  const companyRows = all.filter(
    (r) => r.driverUserId != null && driverIds.has(r.driverUserId),
  );

  let completed = 0;
  let cancelled = 0;
  for (const r of companyRows) {
    if (mobilityHistoryAdminBucket(r.outcome) === "completed") completed++;
    else cancelled++;
  }

  const filtered = companyRows
    .filter((r) => mobilityHistoryAdminBucket(r.outcome) === bucket)
    .sort((a, b) => b.endedAt.localeCompare(a.endedAt));

  const limit = Math.min(50, Math.max(1, options.limit));
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(totalPages, Math.max(1, options.page));
  const start = (page - 1) * limit;
  const rides = filtered.slice(start, start + limit).map(toListItem);

  return {
    rides,
    bucket,
    page,
    limit,
    total,
    totalPages,
    counts: { completed, cancelled },
  };
}
