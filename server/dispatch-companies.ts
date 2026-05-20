/**
 * Empresas despachadoras (centrales) — persistencia Firestore con fallback en memoria.
 */
import { randomUUID } from "crypto";
import { getFirestore, FIRESTORE_COLLECTIONS } from "./firebase-admin";
import {
  DEFAULT_DISPATCH_MOBILITY_FARES,
  DEFAULT_DISPATCH_PACK_FARES,
  type DispatchCompany,
  type DispatchMobilityFares,
  type DispatchPackFares,
} from "@shared/dispatch-company";

const COLLECTION = "dispatch_companies";

let memoryCompanies = new Map<string, DispatchCompany>();

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function sanitizeTier(raw: { perKmUsd?: unknown; minUsd?: unknown }, fallback: { perKmUsd: number; minUsd: number }) {
  return {
    perKmUsd: clamp(Number(raw?.perKmUsd ?? fallback.perKmUsd), 0, 50),
    minUsd: clamp(Number(raw?.minUsd ?? fallback.minUsd), 0, 500),
  };
}

export function sanitizeDispatchMobilityFares(input?: Partial<DispatchMobilityFares>): DispatchMobilityFares {
  const d = DEFAULT_DISPATCH_MOBILITY_FARES;
  const moto = input?.moto ?? d.moto;
  const auto = input?.auto ?? d.auto;
  const camioneta = input?.camioneta ?? d.camioneta;
  const pet = input?.pet_car ?? d.pet_car;
  return {
    moto: sanitizeTier(moto, d.moto),
    auto: { ...sanitizeTier(auto, d.auto), petExtraUsd: clamp(Number(auto.petExtraUsd ?? d.auto.petExtraUsd), 0, 50) },
    camioneta: {
      ...sanitizeTier(camioneta, d.camioneta),
      petExtraUsd: clamp(Number(camioneta.petExtraUsd ?? d.camioneta.petExtraUsd), 0, 50),
    },
    pet_car: sanitizeTier(pet, d.pet_car),
  };
}

export function sanitizeDispatchPackFares(input?: Partial<DispatchPackFares>): DispatchPackFares {
  const d = DEFAULT_DISPATCH_PACK_FARES;
  return {
    moto: sanitizeTier(input?.moto ?? d.moto, d.moto),
    auto: sanitizeTier(input?.auto ?? d.auto, d.auto),
    camioneta: sanitizeTier(input?.camioneta ?? d.camioneta, d.camioneta),
  };
}

function docToCompany(id: string, data: Record<string, unknown>): DispatchCompany {
  const now = new Date().toISOString();
  return {
    id,
    name: String(data.name ?? "").trim(),
    ownerUserId: String(data.ownerUserId ?? ""),
    isActive: data.isActive !== false,
    mobilityFares: sanitizeDispatchMobilityFares(data.mobilityFares as Partial<DispatchMobilityFares>),
    packFares: sanitizeDispatchPackFares(data.packFares as Partial<DispatchPackFares>),
    createdAt: String(data.createdAt ?? now),
    updatedAt: String(data.updatedAt ?? now),
  };
}

export async function createDispatchCompany(input: {
  name: string;
  ownerUserId: string;
}): Promise<DispatchCompany> {
  const id = randomUUID();
  const now = new Date().toISOString();
  const company: DispatchCompany = {
    id,
    name: input.name.trim(),
    ownerUserId: input.ownerUserId,
    isActive: true,
    mobilityFares: { ...DEFAULT_DISPATCH_MOBILITY_FARES },
    packFares: { ...DEFAULT_DISPATCH_PACK_FARES },
    createdAt: now,
    updatedAt: now,
  };
  memoryCompanies.set(id, company);
  const db = getFirestore();
  if (db) {
    await db.collection(COLLECTION).doc(id).set(company);
  }
  return company;
}

export async function getDispatchCompany(id: string): Promise<DispatchCompany | null> {
  const mem = memoryCompanies.get(id);
  if (mem) return mem;
  const db = getFirestore();
  if (!db) return null;
  const snap = await db.collection(COLLECTION).doc(id).get();
  if (!snap.exists) return null;
  const c = docToCompany(snap.id, snap.data() as Record<string, unknown>);
  memoryCompanies.set(id, c);
  return c;
}

export async function listDispatchCompanies(activeOnly = true): Promise<DispatchCompany[]> {
  const db = getFirestore();
  if (!db) {
    return [...memoryCompanies.values()].filter((c) => !activeOnly || c.isActive);
  }
  const snap = await db.collection(COLLECTION).get();
  const list: DispatchCompany[] = [];
  for (const doc of snap.docs) {
    const c = docToCompany(doc.id, doc.data() as Record<string, unknown>);
    memoryCompanies.set(c.id, c);
    if (!activeOnly || c.isActive) list.push(c);
  }
  return list.sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export async function updateDispatchCompany(
  id: string,
  patch: Partial<Pick<DispatchCompany, "name" | "isActive" | "mobilityFares" | "packFares">>,
): Promise<DispatchCompany | null> {
  const current = await getDispatchCompany(id);
  if (!current) return null;
  const updated: DispatchCompany = {
    ...current,
    ...patch,
    mobilityFares: patch.mobilityFares
      ? sanitizeDispatchMobilityFares(patch.mobilityFares)
      : current.mobilityFares,
    packFares: patch.packFares ? sanitizeDispatchPackFares(patch.packFares) : current.packFares,
    updatedAt: new Date().toISOString(),
  };
  memoryCompanies.set(id, updated);
  const db = getFirestore();
  if (db) {
    await db.collection(COLLECTION).doc(id).set(updated, { merge: true });
  }
  return updated;
}

export async function getDispatchCompanyForUser(userId: string): Promise<DispatchCompany | null> {
  const { genFebStorage } = await import("./storage-genfeb");
  const user = (await genFebStorage.getUserById(userId)) as { dispatchCompanyId?: string } | null;
  const cid = user?.dispatchCompanyId;
  if (!cid) return null;
  return getDispatchCompany(cid);
}
