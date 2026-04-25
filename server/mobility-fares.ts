/**
 * Tarifas de Movilidad y envíos (Car Go / Delivery / Carga) configurables.
 * Persistencia: Firestore platform_settings/global. Fallback: valores por defecto en memoria.
 */
import { getFirestore, FIRESTORE_COLLECTIONS } from "./firebase-admin";

const DOC_ID = "global";

export type MobilityFares = {
  moto: { baseUsd: number; perKmUsd: number };
  auto: { baseDayUsd: number; baseNightUsd: number; perKmUsd: number; petExtraUsd: number };
  camioneta: { baseUsd: number; perKmUsd: number; petExtraUsd: number };
};

export const DEFAULT_MOBILITY_FARES: MobilityFares = {
  // Delivery / Compras
  moto: { baseUsd: 1.75, perKmUsd: 0.5 },
  // Transporte personas (Car Go)
  auto: { baseDayUsd: 1.5, baseNightUsd: 1.75, perKmUsd: 0.85, petExtraUsd: 1.0 },
  // Carga / Personas+ (flete local)
  camioneta: { baseUsd: 20.0, perKmUsd: 1.25, petExtraUsd: 2.0 },
};

let cache: { value: MobilityFares; at: number } | null = null;
const TTL_MS = 15_000;
let memoryOnly: MobilityFares | null = null;

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function sanitize(input: Partial<MobilityFares>): MobilityFares {
  const moto = input.moto ?? DEFAULT_MOBILITY_FARES.moto;
  const auto = input.auto ?? DEFAULT_MOBILITY_FARES.auto;
  const camioneta = input.camioneta ?? DEFAULT_MOBILITY_FARES.camioneta;

  return {
    moto: {
      baseUsd: clamp(Number(moto.baseUsd), 0, 100),
      perKmUsd: clamp(Number(moto.perKmUsd), 0, 20),
    },
    auto: {
      baseDayUsd: clamp(Number(auto.baseDayUsd), 0, 100),
      baseNightUsd: clamp(Number(auto.baseNightUsd), 0, 100),
      perKmUsd: clamp(Number(auto.perKmUsd), 0, 20),
      petExtraUsd: clamp(Number(auto.petExtraUsd), 0, 50),
    },
    camioneta: {
      baseUsd: clamp(Number(camioneta.baseUsd), 0, 500),
      perKmUsd: clamp(Number(camioneta.perKmUsd), 0, 50),
      petExtraUsd: clamp(Number(camioneta.petExtraUsd), 0, 50),
    },
  };
}

export async function getMobilityFares(): Promise<MobilityFares> {
  const db = getFirestore();
  if (!db) return memoryOnly ?? DEFAULT_MOBILITY_FARES;
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  try {
    const snap = await db.collection(FIRESTORE_COLLECTIONS.PLATFORM_SETTINGS).doc(DOC_ID).get();
    if (!snap.exists) {
      cache = { value: DEFAULT_MOBILITY_FARES, at: Date.now() };
      return DEFAULT_MOBILITY_FARES;
    }
    const raw = (snap.data() as { mobilityFares?: Partial<MobilityFares> }).mobilityFares ?? {};
    const v = sanitize(raw);
    cache = { value: v, at: Date.now() };
    return v;
  } catch {
    return DEFAULT_MOBILITY_FARES;
  }
}

export function invalidateMobilityFaresCache(): void {
  cache = null;
}

export async function setMobilityFares(next: Partial<MobilityFares>): Promise<MobilityFares> {
  const sanitized = sanitize(next);
  const db = getFirestore();
  if (db) {
    await db.collection(FIRESTORE_COLLECTIONS.PLATFORM_SETTINGS).doc(DOC_ID).set(
      {
        mobilityFares: sanitized,
        updatedAt: new Date(),
      },
      { merge: true }
    );
  } else {
    memoryOnly = sanitized;
  }
  invalidateMobilityFaresCache();
  cache = { value: sanitized, at: Date.now() };
  return sanitized;
}

