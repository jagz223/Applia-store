import crypto from "crypto";
import { getFirestore, FIRESTORE_COLLECTIONS } from "./firebase-admin";
import type { StorePaymentGatewayKind } from "@shared/store-payment-gateways";
import type { StoreFulfillmentMode } from "@shared/store-fulfillment";
import type { StoreOrder, StoreOrderDeliveryLocation, StoreOrderLineItem } from "@shared/store-order-schema";
import { appliaStorage } from "./storage-applia";
import { notifyStoreOwnerNewOrder } from "./store-order-notifications";

export type StorePendingCheckout = {
  id: string;
  userId: string;
  storeId: number;
  storeName: string;
  storeSlug: string;
  gatewayKind: StorePaymentGatewayKind;
  paymentMethodId: number;
  paymentMethodName: string;
  paymentMethodAccountNumber: string;
  fulfillmentMode: StoreFulfillmentMode | null;
  branchId: string;
  branchName: string;
  storeLocation: StoreOrderDeliveryLocation | null;
  customerNote: string;
  amountDue: number;
  deliveryFee: number;
  deliveryDistanceM: number | null;
  deliveryLocation: StoreOrderDeliveryLocation | null;
  items: StoreOrderLineItem[];
  subtotal: number;
  status: "pending" | "processing" | "completed";
  gatewayReference: string | null;
  storeOrderId: number | null;
  createdAt: string;
  updatedAt: string;
};

const memory = new Map<string, StorePendingCheckout>();

function col() {
  const db = getFirestore();
  if (!db) return null;
  return db.collection(FIRESTORE_COLLECTIONS.STORE_PENDING_CHECKOUTS);
}

function mapDoc(id: string, data: Record<string, unknown>): StorePendingCheckout {
  return {
    id,
    userId: String(data.userId ?? ""),
    storeId: Number(data.storeId ?? 0),
    storeName: String(data.storeName ?? "Tienda"),
    storeSlug: String(data.storeSlug ?? "").trim(),
    gatewayKind: data.gatewayKind as StorePaymentGatewayKind,
    paymentMethodId: Number(data.paymentMethodId ?? 0),
    paymentMethodName: String(data.paymentMethodName ?? ""),
    paymentMethodAccountNumber: String(data.paymentMethodAccountNumber ?? ""),
    fulfillmentMode: (data.fulfillmentMode as StoreFulfillmentMode | null) ?? null,
    branchId: String(data.branchId ?? ""),
    branchName: String(data.branchName ?? ""),
    storeLocation: (data.storeLocation as StoreOrderDeliveryLocation | null) ?? null,
    customerNote: String(data.customerNote ?? ""),
    amountDue: Number(data.amountDue ?? 0),
    deliveryFee: Number(data.deliveryFee ?? 0),
    deliveryDistanceM: data.deliveryDistanceM == null ? null : Number(data.deliveryDistanceM),
    deliveryLocation: (data.deliveryLocation as StoreOrderDeliveryLocation | null) ?? null,
    items: Array.isArray(data.items) ? (data.items as StoreOrderLineItem[]) : [],
    subtotal: Number(data.subtotal ?? 0),
    status: data.status === "completed" ? "completed" : data.status === "processing" ? "processing" : "pending",
    gatewayReference: data.gatewayReference != null ? String(data.gatewayReference) : null,
    storeOrderId: data.storeOrderId == null ? null : Number(data.storeOrderId),
    createdAt: String(data.createdAt ?? new Date().toISOString()),
    updatedAt: String(data.updatedAt ?? new Date().toISOString()),
  };
}

export async function createStorePendingCheckout(
  input: Omit<StorePendingCheckout, "id" | "status" | "gatewayReference" | "storeOrderId" | "createdAt" | "updatedAt">,
): Promise<StorePendingCheckout> {
  const now = new Date().toISOString();
  const row: StorePendingCheckout = {
    ...input,
    id: crypto.randomUUID(),
    status: "pending",
    gatewayReference: null,
    storeOrderId: null,
    createdAt: now,
    updatedAt: now,
  };
  const collection = col();
  if (collection) {
    await collection.doc(row.id).set(row);
  } else {
    memory.set(row.id, row);
  }
  return row;
}

export async function getStorePendingCheckout(id: string): Promise<StorePendingCheckout | undefined> {
  const pendingId = id.trim();
  if (!pendingId) return undefined;
  const collection = col();
  if (collection) {
    const doc = await collection.doc(pendingId).get();
    if (!doc.exists) return undefined;
    return mapDoc(doc.id, (doc.data() ?? {}) as Record<string, unknown>);
  }
  return memory.get(pendingId);
}

async function saveStorePendingCheckout(row: StorePendingCheckout): Promise<void> {
  const collection = col();
  if (collection) {
    await collection.doc(row.id).set(row);
  } else {
    memory.set(row.id, row);
  }
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function claimStorePendingCheckout(pendingId: string): Promise<{
  storeId: number;
  userId: string;
  existingOrderId: number | null;
}> {
  const markProcessing = async (row: StorePendingCheckout) => {
    const next = { ...row, status: "processing" as const, updatedAt: new Date().toISOString() };
    await saveStorePendingCheckout(next);
  };

  for (let attempt = 0; attempt < 6; attempt++) {
    const pending = await getStorePendingCheckout(pendingId);
    if (!pending) throw new Error("STORE_PENDING_CHECKOUT_NOT_FOUND");
    if (pending.status === "completed" && pending.storeOrderId) {
      return { storeId: pending.storeId, userId: pending.userId, existingOrderId: pending.storeOrderId };
    }
    if (pending.status === "pending") {
      await markProcessing(pending);
      return { storeId: pending.storeId, userId: pending.userId, existingOrderId: null };
    }
    await sleep(300);
  }

  const last = await getStorePendingCheckout(pendingId);
  if (last?.status === "completed" && last.storeOrderId) {
    return { storeId: last.storeId, userId: last.userId, existingOrderId: last.storeOrderId };
  }
  throw new Error("STORE_PENDING_CHECKOUT_BUSY");
}

export async function fulfillStorePendingCheckout(params: {
  pendingId: string;
  gatewayReference: string;
}): Promise<{ order: StoreOrder; created: boolean }> {
  const claimed = await claimStorePendingCheckout(params.pendingId);
  if (claimed.existingOrderId) {
    const existing =
      (await appliaStorage.getStoreOrder(claimed.storeId, claimed.existingOrderId)) ??
      (await appliaStorage.getStoreOrderForUser(claimed.userId, claimed.existingOrderId));
    if (existing) return { order: existing, created: false };
  }

  const pending = await getStorePendingCheckout(params.pendingId);
  if (!pending) throw new Error("STORE_PENDING_CHECKOUT_NOT_FOUND");

  const order = await appliaStorage.createStoreOrder({
    storeId: pending.storeId,
    userId: pending.userId,
    paymentMethodId: pending.paymentMethodId,
    paymentMethodName: pending.paymentMethodName,
    paymentMethodAccountNumber: pending.paymentMethodAccountNumber,
    fulfillmentMode: pending.fulfillmentMode,
    branchId: pending.branchId,
    branchName: pending.branchName,
    storeLocation: pending.storeLocation,
    reference: params.gatewayReference,
    proofImageUrl: "",
    customerNote: pending.customerNote,
    amountDue: pending.amountDue,
    amountPaid: pending.amountDue,
    deliveryFee: pending.deliveryFee,
    deliveryDistanceM: pending.deliveryDistanceM,
    deliveryLocation: pending.deliveryLocation,
    items: pending.items,
    subtotal: pending.subtotal,
    packRideId: null,
    deliveryUnreadCount: 0,
    status: "confirmado",
  });

  const next: StorePendingCheckout = {
    ...pending,
    status: "completed",
    gatewayReference: params.gatewayReference,
    storeOrderId: order.id,
    updatedAt: new Date().toISOString(),
  };
  await saveStorePendingCheckout(next);
  await appliaStorage.deleteStoreCart(pending.userId, pending.storeId);

  const store = await appliaStorage.getStoreById(pending.storeId);
  if (store) {
    void notifyStoreOwnerNewOrder(order, store).catch((err) =>
      console.error("[stores] notify owner new order after gateway", err),
    );
  }

  return { order, created: true };
}
