import { randomUUID } from "crypto";
import { getFirestore } from "./firebase-admin";
import type { CentralAffiliationRequestRecord, CentralAffiliationStatus, CentralDataAccessStatus } from "@shared/central-affiliation";

const COLLECTION = "central_affiliation_requests";

const memory = new Map<string, CentralAffiliationRequestRecord>();

function nowIso() {
  return new Date().toISOString();
}

function docToRecord(id: string, data: Record<string, unknown>): CentralAffiliationRequestRecord {
  return {
    id,
    applicantUserId: String(data.applicantUserId ?? ""),
    providerId: Number(data.providerId ?? 0),
    dispatchCompanyId: String(data.dispatchCompanyId ?? ""),
    status: (data.status as CentralAffiliationStatus) ?? "pending",
    dataAccessStatus: (data.dataAccessStatus as CentralDataAccessStatus) ?? "none",
    createdAt: String(data.createdAt ?? nowIso()),
    updatedAt: String(data.updatedAt ?? nowIso()),
    dataAccessRequestedByUserId:
      data.dataAccessRequestedByUserId === undefined ? undefined : (data.dataAccessRequestedByUserId as string | null),
    dataAccessRequestedAt:
      data.dataAccessRequestedAt === undefined ? undefined : (data.dataAccessRequestedAt as string | null),
  };
}

export async function createCentralAffiliationRequest(input: {
  applicantUserId: string;
  providerId: number;
  dispatchCompanyId: string;
}): Promise<CentralAffiliationRequestRecord> {
  const db = getFirestore();
  const row: CentralAffiliationRequestRecord = {
    id: randomUUID(),
    applicantUserId: input.applicantUserId,
    providerId: input.providerId,
    dispatchCompanyId: input.dispatchCompanyId,
    status: "pending",
    dataAccessStatus: "none",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  if (!db) {
    memory.set(row.id, row);
    return row;
  }

  await db.collection(COLLECTION).doc(row.id).set(row);
  memory.set(row.id, row);
  return row;
}

export async function findPendingAffiliation(
  applicantUserId: string,
  companyId: string,
): Promise<CentralAffiliationRequestRecord | null> {
  const db = getFirestore();
  if (!db) {
    for (const r of memory.values()) {
      if (r.applicantUserId === applicantUserId && r.dispatchCompanyId === companyId && r.status === "pending") {
        return r;
      }
    }
    return null;
  }
  const snap = await db.collection(COLLECTION).where("applicantUserId", "==", applicantUserId).get();
  for (const d of snap.docs) {
    const r = docToRecord(d.id, d.data() as Record<string, unknown>);
    if (r.dispatchCompanyId === companyId && r.status === "pending") return r;
  }
  return null;
}

export async function getCentralAffiliationRequest(id: string): Promise<CentralAffiliationRequestRecord | null> {
  const mem = memory.get(id);
  if (mem) return mem;
  const db = getFirestore();
  if (!db) return null;
  const doc = await db.collection(COLLECTION).doc(id).get();
  if (!doc.exists) return null;
  const r = docToRecord(doc.id, doc.data() as Record<string, unknown>);
  memory.set(id, r);
  return r;
}

export async function listCentralAffiliationRequestsForCompany(
  companyId: string,
): Promise<CentralAffiliationRequestRecord[]> {
  const db = getFirestore();
  if (!db) {
    return [...memory.values()]
      .filter((r) => r.dispatchCompanyId === companyId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  const snap = await db.collection(COLLECTION).where("dispatchCompanyId", "==", companyId).get();
  const list = snap.docs.map((d) => docToRecord(d.id, d.data() as Record<string, unknown>));
  list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return list;
}

export async function listCentralAffiliationRequestsForApplicant(
  userId: string,
): Promise<CentralAffiliationRequestRecord[]> {
  const db = getFirestore();
  if (!db) {
    return [...memory.values()]
      .filter((r) => r.applicantUserId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  const snap = await db.collection(COLLECTION).where("applicantUserId", "==", userId).get();
  const list = snap.docs.map((d) => docToRecord(d.id, d.data() as Record<string, unknown>));
  list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return list;
}

export async function updateCentralAffiliationRequest(
  id: string,
  patch: Partial<
    Pick<
      CentralAffiliationRequestRecord,
      | "status"
      | "dataAccessStatus"
      | "dataAccessRequestedByUserId"
      | "dataAccessRequestedAt"
      | "updatedAt"
    >
  >,
): Promise<CentralAffiliationRequestRecord | null> {
  const cur = await getCentralAffiliationRequest(id);
  if (!cur) return null;
  const next: CentralAffiliationRequestRecord = {
    ...cur,
    ...patch,
    updatedAt: nowIso(),
  };
  const db = getFirestore();
  if (!db) {
    memory.set(id, next);
    return next;
  }
  await db.collection(COLLECTION).doc(id).set(next, { merge: true });
  memory.set(id, next);
  return next;
}
