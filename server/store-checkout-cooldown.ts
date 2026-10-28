import { getFirestore, FIRESTORE_COLLECTIONS } from "./firebase-admin";

/** Antiraiding: no permitir otro pedido del mismo usuario hasta pasados estos ms. */
export const STORE_CHECKOUT_COOLDOWN_MS = 10_000;

export class StoreCheckoutCooldownError extends Error {
  readonly retryAfterSec: number;

  constructor(retryAfterSec: number) {
    super("STORE_CHECKOUT_COOLDOWN");
    this.name = "StoreCheckoutCooldownError";
    this.retryAfterSec = Math.max(1, retryAfterSec);
  }
}

const memoryLastOrderAt = new Map<string, number>();

function col() {
  const db = getFirestore();
  if (!db) return null;
  return db.collection(FIRESTORE_COLLECTIONS.STORE_CHECKOUT_COOLDOWNS);
}

async function readLastOrderAt(userId: string): Promise<number | null> {
  const uid = userId.trim();
  if (!uid) return null;
  const collection = col();
  if (collection) {
    const snap = await collection.doc(uid).get();
    if (!snap.exists) return null;
    const raw = (snap.data() as { lastOrderAtMs?: unknown } | undefined)?.lastOrderAtMs;
    const n = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return memoryLastOrderAt.get(uid) ?? null;
}

/**
 * Bloquea si el usuario creó un pedido hace menos de 10s.
 * No aplica a reintentos idempotentes (el caller debe omitir el check si reusa key).
 */
export async function assertStoreCheckoutCooldown(userId: string): Promise<void> {
  const last = await readLastOrderAt(userId);
  if (last == null) return;
  const elapsed = Date.now() - last;
  if (elapsed >= STORE_CHECKOUT_COOLDOWN_MS) return;
  const retryAfterSec = Math.ceil((STORE_CHECKOUT_COOLDOWN_MS - elapsed) / 1000);
  throw new StoreCheckoutCooldownError(retryAfterSec);
}

/** Marca el instante en que el usuario acaba de crear un pedido. */
export async function markStoreCheckoutCooldown(userId: string): Promise<void> {
  const uid = userId.trim();
  if (!uid) return;
  const now = Date.now();
  const collection = col();
  if (collection) {
    await collection.doc(uid).set(
      {
        userId: uid,
        lastOrderAtMs: now,
        updatedAt: new Date(now).toISOString(),
      },
      { merge: true },
    );
    return;
  }
  memoryLastOrderAt.set(uid, now);
}

export function storeCheckoutCooldownMessage(retryAfterSec: number): string {
  const sec = Math.max(1, retryAfterSec);
  return sec === 1
    ? "Espera 1 segundo antes de crear otro pedido."
    : `Espera ${sec} segundos antes de crear otro pedido.`;
}
