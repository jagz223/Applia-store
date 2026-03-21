/**
 * Tasa de comisión de plataforma configurable (Firestore + caché en proceso).
 * Sin Firebase: valor en memoria tras el primer PATCH en la sesión.
 */
import { getFirestore, FIRESTORE_COLLECTIONS } from "./firebase-admin";
import { PLATFORM_COMMISSION_RATE } from "@shared/platform-commission";

const DOC_ID = "global";

let cache: { value: number; at: number } | null = null;
const TTL_MS = 15_000;

/** Solo en memoria cuando no hay Firestore (desarrollo). */
let memoryOnlyRate: number | null = null;

function clampRate(rate: number): number {
  if (!Number.isFinite(rate)) return PLATFORM_COMMISSION_RATE;
  return Math.min(0.5, Math.max(0.01, rate));
}

export async function getPlatformCommissionRate(): Promise<number> {
  const db = getFirestore();
  if (!db) {
    return memoryOnlyRate ?? PLATFORM_COMMISSION_RATE;
  }
  if (cache && Date.now() - cache.at < TTL_MS) {
    return cache.value;
  }
  try {
    const snap = await db.collection(FIRESTORE_COLLECTIONS.PLATFORM_SETTINGS).doc(DOC_ID).get();
    if (!snap.exists) {
      const v = PLATFORM_COMMISSION_RATE;
      cache = { value: v, at: Date.now() };
      return v;
    }
    const raw = (snap.data() as { commissionRate?: number }).commissionRate;
    const v =
      typeof raw === "number" && Number.isFinite(raw) && raw >= 0.01 && raw <= 0.5
        ? raw
        : PLATFORM_COMMISSION_RATE;
    cache = { value: v, at: Date.now() };
    return v;
  } catch {
    return PLATFORM_COMMISSION_RATE;
  }
}

export function invalidatePlatformCommissionRateCache(): void {
  cache = null;
}

/**
 * @param rate fracción 0.01–0.5 (p. ej. 0.1 = 10 % plataforma)
 */
export async function setPlatformCommissionRate(rate: number): Promise<number> {
  const clamped = clampRate(rate);
  const db = getFirestore();
  if (db) {
    await db.collection(FIRESTORE_COLLECTIONS.PLATFORM_SETTINGS).doc(DOC_ID).set(
      {
        commissionRate: clamped,
        updatedAt: new Date(),
      },
      { merge: true },
    );
  } else {
    memoryOnlyRate = clamped;
  }
  invalidatePlatformCommissionRateCache();
  cache = { value: clamped, at: Date.now() };
  return clamped;
}
