/**
 * Tarifas predeterminadas Pack Go (envíos/delivery) configurables.
 * Persistencia: Firestore platform_settings/global. Fallback: valores por defecto en memoria.
 */
import { getFirestore, FIRESTORE_COLLECTIONS } from "./firebase-admin";

const DOC_ID = "global";

export type PackFares = {
  moto: { baseUsd: number; perKmUsd: number };
  auto: { baseUsd: number; perKmUsd: number };
  camioneta: { baseUsd: number; perKmUsd: number };
};

export const DEFAULT_PACK_FARES: PackFares = {
  moto: { baseUsd: 1.75, perKmUsd: 0.5 },
  auto: { baseUsd: 2.25, perKmUsd: 0.85 },
  camioneta: { baseUsd: 20.0, perKmUsd: 1.25 },
};

let cache: { value: PackFares; at: number } | null = null;
const TTL_MS = 15_000;
let memoryOnly: PackFares | null = null;

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function sanitize(input: Partial<PackFares>): PackFares {
  const moto = input.moto ?? DEFAULT_PACK_FARES.moto;
  const auto = input.auto ?? DEFAULT_PACK_FARES.auto;
  const camioneta = input.camioneta ?? DEFAULT_PACK_FARES.camioneta;
  return {
    moto: { baseUsd: clamp(Number(moto.baseUsd), 0, 100), perKmUsd: clamp(Number(moto.perKmUsd), 0, 20) },
    auto: { baseUsd: clamp(Number(auto.baseUsd), 0, 200), perKmUsd: clamp(Number(auto.perKmUsd), 0, 50) },
    camioneta: { baseUsd: clamp(Number(camioneta.baseUsd), 0, 500), perKmUsd: clamp(Number(camioneta.perKmUsd), 0, 80) },
  };
}

export async function getPackFares(): Promise<PackFares> {
  const db = getFirestore();
  if (!db) return memoryOnly ?? DEFAULT_PACK_FARES;
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  try {
    const snap = await db.collection(FIRESTORE_COLLECTIONS.PLATFORM_SETTINGS).doc(DOC_ID).get();
    if (!snap.exists) {
      cache = { value: DEFAULT_PACK_FARES, at: Date.now() };
      return DEFAULT_PACK_FARES;
    }
    const raw = (snap.data() as { packFares?: Partial<PackFares> }).packFares ?? {};
    const v = sanitize(raw);
    cache = { value: v, at: Date.now() };
    return v;
  } catch {
    return DEFAULT_PACK_FARES;
  }
}

export function invalidatePackFaresCache(): void {
  cache = null;
}

export async function setPackFares(next: Partial<PackFares>): Promise<PackFares> {
  const sanitized = sanitize(next);
  const db = getFirestore();
  if (db) {
    await db.collection(FIRESTORE_COLLECTIONS.PLATFORM_SETTINGS).doc(DOC_ID).set(
      {
        packFares: sanitized,
        updatedAt: new Date(),
      },
      { merge: true }
    );
  } else {
    memoryOnly = sanitized;
  }
  invalidatePackFaresCache();
  cache = { value: sanitized, at: Date.now() };
  return sanitized;
}

