import { getFirestore, FIRESTORE_COLLECTIONS } from "./firebase-admin";
import { appliaStorage } from "./storage-applia";
import type { StoreCart } from "@shared/store-cart-schema";

export type CheckoutIdempotencyRecord = {
  userId: string;
  storeId: number;
  idempotencyKey: string;
  status: "processing" | "completed" | "failed";
  storeOrderId: number | null;
  checkoutUrl: string | null;
  gatewayKind: string | null;
  createdAt: string;
  updatedAt: string;
};

const memoryIdem = new Map<string, CheckoutIdempotencyRecord>();

function idemDocId(userId: string, storeId: number, key: string): string {
  return `${userId}_${storeId}_${key.trim().toLowerCase()}`;
}

function col() {
  const db = getFirestore();
  if (!db) return null;
  return db.collection(FIRESTORE_COLLECTIONS.STORE_CHECKOUT_IDEMPOTENCY);
}

function mapRecord(data: Record<string, unknown>): CheckoutIdempotencyRecord {
  return {
    userId: String(data.userId ?? ""),
    storeId: Number(data.storeId ?? 0),
    idempotencyKey: String(data.idempotencyKey ?? ""),
    status:
      data.status === "completed"
        ? "completed"
        : data.status === "failed"
          ? "failed"
          : "processing",
    storeOrderId: data.storeOrderId == null ? null : Number(data.storeOrderId),
    checkoutUrl: data.checkoutUrl != null ? String(data.checkoutUrl) : null,
    gatewayKind: data.gatewayKind != null ? String(data.gatewayKind) : null,
    createdAt: String(data.createdAt ?? new Date().toISOString()),
    updatedAt: String(data.updatedAt ?? new Date().toISOString()),
  };
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/** Lectura sin claim: si el intento ya terminó, reutilizar resultado. */
export async function getCompletedCheckoutIdempotency(params: {
  userId: string;
  storeId: number;
  idempotencyKey: string;
}): Promise<{
  storeOrderId: number | null;
  checkoutUrl: string | null;
  gatewayKind: string | null;
} | null> {
  const key = params.idempotencyKey.trim();
  if (!key) return null;
  const docId = idemDocId(params.userId, params.storeId, key);
  const collection = col();
  if (collection) {
    const snap = await collection.doc(docId).get();
    if (!snap.exists) return null;
    const row = mapRecord((snap.data() ?? {}) as Record<string, unknown>);
    if (row.status !== "completed") return null;
    return {
      storeOrderId: row.storeOrderId,
      checkoutUrl: row.checkoutUrl,
      gatewayKind: row.gatewayKind,
    };
  }
  const row = memoryIdem.get(docId);
  if (!row || row.status !== "completed") return null;
  return {
    storeOrderId: row.storeOrderId,
    checkoutUrl: row.checkoutUrl,
    gatewayKind: row.gatewayKind,
  };
}

/**
 * Claim de idempotencia: el primer caller gana; reintentos con la misma key
 * reutilizan el resultado (pedido o URL de pasarela).
 */
export async function beginCheckoutIdempotency(params: {
  userId: string;
  storeId: number;
  idempotencyKey: string;
}): Promise<
  | { kind: "new" }
  | {
      kind: "completed";
      storeOrderId: number | null;
      checkoutUrl: string | null;
      gatewayKind: string | null;
    }
> {
  const key = params.idempotencyKey.trim();
  if (!key) return { kind: "new" };
  const docId = idemDocId(params.userId, params.storeId, key);
  const now = new Date().toISOString();
  const collection = col();

  if (collection) {
    const db = getFirestore()!;
    for (let attempt = 0; attempt < 8; attempt++) {
      const result = await db.runTransaction(async (tx) => {
        const ref = collection.doc(docId);
        const snap = await tx.get(ref);
        if (!snap.exists) {
          const row: CheckoutIdempotencyRecord = {
            userId: params.userId,
            storeId: params.storeId,
            idempotencyKey: key,
            status: "processing",
            storeOrderId: null,
            checkoutUrl: null,
            gatewayKind: null,
            createdAt: now,
            updatedAt: now,
          };
          tx.set(ref, row);
          return { kind: "new" as const };
        }
        const row = mapRecord((snap.data() ?? {}) as Record<string, unknown>);
        if (row.status === "completed") {
          return {
            kind: "completed" as const,
            storeOrderId: row.storeOrderId,
            checkoutUrl: row.checkoutUrl,
            gatewayKind: row.gatewayKind,
          };
        }
        if (row.status === "failed") {
          const next: CheckoutIdempotencyRecord = {
            ...row,
            status: "processing",
            storeOrderId: null,
            checkoutUrl: null,
            gatewayKind: null,
            updatedAt: now,
          };
          tx.set(ref, next);
          return { kind: "new" as const };
        }
        return { kind: "processing" as const };
      });

      if (result.kind === "new" || result.kind === "completed") return result;
      await sleep(250);
    }
    throw new Error("STORE_CHECKOUT_IDEMPOTENCY_BUSY");
  }

  // Fallback in-memory (dev sin Firestore)
  for (let attempt = 0; attempt < 8; attempt++) {
    const existing = memoryIdem.get(docId);
    if (!existing) {
      memoryIdem.set(docId, {
        userId: params.userId,
        storeId: params.storeId,
        idempotencyKey: key,
        status: "processing",
        storeOrderId: null,
        checkoutUrl: null,
        gatewayKind: null,
        createdAt: now,
        updatedAt: now,
      });
      return { kind: "new" };
    }
    if (existing.status === "completed") {
      return {
        kind: "completed",
        storeOrderId: existing.storeOrderId,
        checkoutUrl: existing.checkoutUrl,
        gatewayKind: existing.gatewayKind,
      };
    }
    if (existing.status === "failed") {
      memoryIdem.set(docId, {
        ...existing,
        status: "processing",
        storeOrderId: null,
        checkoutUrl: null,
        gatewayKind: null,
        updatedAt: now,
      });
      return { kind: "new" };
    }
    await sleep(250);
  }
  throw new Error("STORE_CHECKOUT_IDEMPOTENCY_BUSY");
}

export async function completeCheckoutIdempotency(params: {
  userId: string;
  storeId: number;
  idempotencyKey: string;
  storeOrderId?: number | null;
  checkoutUrl?: string | null;
  gatewayKind?: string | null;
}): Promise<void> {
  const key = params.idempotencyKey.trim();
  if (!key) return;
  const docId = idemDocId(params.userId, params.storeId, key);
  const now = new Date().toISOString();
  const collection = col();
  const patch = {
    status: "completed" as const,
    storeOrderId: params.storeOrderId ?? null,
    checkoutUrl: params.checkoutUrl ?? null,
    gatewayKind: params.gatewayKind ?? null,
    updatedAt: now,
  };
  if (collection) {
    await collection.doc(docId).set(patch, { merge: true });
    return;
  }
  const prev = memoryIdem.get(docId);
  if (prev) memoryIdem.set(docId, { ...prev, ...patch });
}

export async function failCheckoutIdempotency(params: {
  userId: string;
  storeId: number;
  idempotencyKey: string;
}): Promise<void> {
  const key = params.idempotencyKey.trim();
  if (!key) return;
  const docId = idemDocId(params.userId, params.storeId, key);
  const now = new Date().toISOString();
  const collection = col();
  if (collection) {
    await collection.doc(docId).set({ status: "failed", updatedAt: now }, { merge: true });
    return;
  }
  const prev = memoryIdem.get(docId);
  if (prev) memoryIdem.set(docId, { ...prev, status: "failed", updatedAt: now });
}

/**
 * Consume el carrito de forma atómica: el primer checkout gana.
 * Requests concurrentes posteriores ven carrito vacío.
 */
export async function consumeStoreCartAtomic(
  userId: string,
  storeId: number,
): Promise<StoreCart | null> {
  const db = getFirestore();
  if (!db) {
    const cart = await appliaStorage.getStoreCart(userId, storeId);
    if (!cart || cart.items.length === 0) return null;
    await appliaStorage.deleteStoreCart(userId, storeId);
    return cart;
  }

  const ref = db.collection(FIRESTORE_COLLECTIONS.STORE_CARTS).doc(`${userId}_${storeId}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const data = (snap.data() ?? {}) as Record<string, unknown>;
    const items = Array.isArray(data.items) ? data.items : [];
    if (items.length === 0) {
      tx.delete(ref);
      return null;
    }
    const expiresAt = data.expiresAt;
    const expiresMs =
      expiresAt instanceof Date
        ? expiresAt.getTime()
        : typeof expiresAt === "string"
          ? Date.parse(expiresAt)
          : typeof (expiresAt as { toDate?: () => Date })?.toDate === "function"
            ? (expiresAt as { toDate: () => Date }).toDate().getTime()
            : NaN;
    if (Number.isFinite(expiresMs) && expiresMs <= Date.now()) {
      tx.delete(ref);
      return null;
    }
    const cart: StoreCart = {
      userId: String(data.userId ?? userId),
      storeId: Number(data.storeId ?? storeId),
      items: items as StoreCart["items"],
      fulfillmentMode: (data.fulfillmentMode as StoreCart["fulfillmentMode"]) ?? null,
      expiresAt: Number.isFinite(expiresMs) ? new Date(expiresMs) : new Date(Date.now() + 86_400_000),
      createdAt:
        data.createdAt instanceof Date
          ? data.createdAt
          : typeof data.createdAt === "string"
            ? new Date(data.createdAt)
            : new Date(),
      updatedAt: new Date(),
    };
    tx.delete(ref);
    return cart;
  });
}
