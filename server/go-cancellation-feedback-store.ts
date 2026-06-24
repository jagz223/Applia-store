import { z } from "zod";
import crypto from "crypto";
import {
  type GoCancellationFeedbackRecord,
  type GoCancellationModule,
  type GoCancellationParty,
  type GoDriverCancelPhase,
  resolveGoCancellationReasonLabel,
} from "@shared/go-cancellation-feedback";
import { getFirestore, FIRESTORE_COLLECTIONS } from "./firebase-admin";
import { genFebStorage } from "./storage-genfeb";

const COLLECTION = FIRESTORE_COLLECTIONS.GO_CANCELLATION_FEEDBACK;
const memoryRows = new Map<string, GoCancellationFeedbackRecord>();

export const goCancellationFeedbackBodySchema = z.object({
  reasonCode: z.string().min(1).max(80),
  explanation: z.string().min(3).max(2000),
  driverPhase: z.enum(["en_route", "at_pickup"]).optional().nullable(),
});

export type GoCancellationFeedbackBody = z.infer<typeof goCancellationFeedbackBodySchema>;

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

function docToRecord(id: string, data: Record<string, unknown>): GoCancellationFeedbackRecord {
  return {
    id,
    rideId: String(data.rideId ?? ""),
    module: data.module === "pack" ? "pack" : "cargo",
    cancelledBy: data.cancelledBy === "driver" ? "driver" : "rider",
    cancellerUserId: String(data.cancellerUserId ?? ""),
    cancellerName: String(data.cancellerName ?? ""),
    otherPartyUserId: data.otherPartyUserId != null ? String(data.otherPartyUserId) : null,
    otherPartyName: data.otherPartyName != null ? String(data.otherPartyName) : null,
    rideStatusAtCancel: String(data.rideStatusAtCancel ?? ""),
    driverPhase:
      data.driverPhase === "en_route" || data.driverPhase === "at_pickup"
        ? data.driverPhase
        : null,
    reasonCode: String(data.reasonCode ?? ""),
    reasonLabel: String(data.reasonLabel ?? ""),
    explanation: String(data.explanation ?? ""),
    cancellerRatingAtCancel: Number(data.cancellerRatingAtCancel) || 0,
    cancellerRatingCountAtCancel: Number(data.cancellerRatingCountAtCancel) || 0,
    adminReviewStatus:
      data.adminReviewStatus === "no_penalty" || data.adminReviewStatus === "penalty_applied"
        ? data.adminReviewStatus
        : "pending",
    penaltyAmount: data.penaltyAmount != null ? Number(data.penaltyAmount) : null,
    reviewedAt: data.reviewedAt != null ? toIso(data.reviewedAt) : null,
    reviewedByAdminId: data.reviewedByAdminId != null ? String(data.reviewedByAdminId) : null,
    createdAt: toIso(data.createdAt),
  };
}

function sortDesc(rows: GoCancellationFeedbackRecord[]): GoCancellationFeedbackRecord[] {
  return [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createGoCancellationFeedback(input: {
  rideId: string;
  module: GoCancellationModule;
  cancelledBy: GoCancellationParty;
  cancellerUserId: string;
  otherPartyUserId: string | null;
  rideStatusAtCancel: string;
  driverPhase?: GoDriverCancelPhase | null;
  reasonCode: string;
  explanation: string;
}): Promise<GoCancellationFeedbackRecord> {
  const reasonLabel =
    resolveGoCancellationReasonLabel({
      party: input.cancelledBy,
      module: input.module,
      driverPhase: input.driverPhase ?? null,
      reasonCode: input.reasonCode,
    }) ?? input.reasonCode;

  const canceller = await genFebStorage.getUserById(input.cancellerUserId);
  const other = input.otherPartyUserId ? await genFebStorage.getUserById(input.otherPartyUserId) : null;
  const cancellerName = canceller
    ? [canceller.name, canceller.lastName].filter(Boolean).join(" ").trim() || canceller.name
    : "Usuario";
  const otherPartyName = other
    ? [other.name, other.lastName].filter(Boolean).join(" ").trim() || other.name
    : null;

  const rating =
    typeof (canceller as { rating?: unknown })?.rating === "number"
      ? (canceller as { rating: number }).rating
      : Number((canceller as { rating?: unknown })?.rating) || 5;
  const ratingCount =
    typeof (canceller as { ratingCount?: unknown })?.ratingCount === "number"
      ? (canceller as { ratingCount: number }).ratingCount
      : Number((canceller as { ratingCount?: unknown })?.ratingCount) || 0;

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const row: GoCancellationFeedbackRecord = {
    id,
    rideId: input.rideId,
    module: input.module,
    cancelledBy: input.cancelledBy,
    cancellerUserId: input.cancellerUserId,
    cancellerName,
    otherPartyUserId: input.otherPartyUserId,
    otherPartyName,
    rideStatusAtCancel: input.rideStatusAtCancel,
    driverPhase: input.driverPhase ?? null,
    reasonCode: input.reasonCode,
    reasonLabel,
    explanation: input.explanation.trim(),
    cancellerRatingAtCancel: rating,
    cancellerRatingCountAtCancel: ratingCount,
    adminReviewStatus: "pending",
    penaltyAmount: null,
    reviewedAt: null,
    reviewedByAdminId: null,
    createdAt,
  };

  const db = getFirestore();
  if (db) {
    await db.collection(COLLECTION).doc(id).set(row);
  } else {
    memoryRows.set(id, row);
  }
  return row;
}

export async function listGoCancellationFeedbackForAdmin(opts?: {
  limit?: number;
  page?: number;
}): Promise<{ rows: GoCancellationFeedbackRecord[]; total: number; page: number; totalPages: number }> {
  const limit = Math.min(100, Math.max(1, opts?.limit ?? 20));
  const page = Math.max(1, opts?.page ?? 1);
  const db = getFirestore();
  let all: GoCancellationFeedbackRecord[] = [];
  if (db) {
    const snap = await db.collection(COLLECTION).orderBy("createdAt", "desc").limit(500).get();
    all = snap.docs.map((d) => docToRecord(d.id, d.data() as Record<string, unknown>));
  } else {
    all = sortDesc([...memoryRows.values()]);
  }
  const total = all.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * limit;
  return { rows: all.slice(start, start + limit), total, page: safePage, totalPages };
}

export async function getGoCancellationFeedbackById(id: string): Promise<GoCancellationFeedbackRecord | null> {
  const db = getFirestore();
  if (db) {
    const doc = await db.collection(COLLECTION).doc(id).get();
    if (!doc.exists) return null;
    return docToRecord(doc.id, doc.data() as Record<string, unknown>);
  }
  return memoryRows.get(id) ?? null;
}

export async function reviewGoCancellationFeedback(input: {
  id: string;
  adminUserId: string;
  action: "no_penalty" | "penalty";
  penaltyAmount?: number;
}): Promise<GoCancellationFeedbackRecord> {
  const row = await getGoCancellationFeedbackById(input.id);
  if (!row) throw new Error("Registro no encontrado");
  if (row.adminReviewStatus !== "pending") throw new Error("Este registro ya fue revisado");

  const reviewedAt = new Date().toISOString();
  let penaltyAmount: number | null = null;

  if (input.action === "penalty") {
    const amt = Number(input.penaltyAmount);
    if (!Number.isFinite(amt) || amt <= 0) throw new Error("Indica un monto válido para restar");
    penaltyAmount = Math.round(amt * 100) / 100;
    const user = await genFebStorage.getUserById(row.cancellerUserId);
    const current =
      typeof (user as { rating?: unknown })?.rating === "number"
        ? (user as { rating: number }).rating
        : Number((user as { rating?: unknown })?.rating) || 5;
    const nextRating = Math.round((current - penaltyAmount) * 100) / 100;
    await genFebStorage.updateUser(row.cancellerUserId, { rating: nextRating });
  }

  const patch: Partial<GoCancellationFeedbackRecord> = {
    adminReviewStatus: input.action === "penalty" ? "penalty_applied" : "no_penalty",
    penaltyAmount,
    reviewedAt,
    reviewedByAdminId: input.adminUserId,
  };

  const db = getFirestore();
  if (db) {
    await db.collection(COLLECTION).doc(row.id).update(patch);
  } else {
    memoryRows.set(row.id, { ...row, ...patch });
  }
  return { ...row, ...patch };
}
