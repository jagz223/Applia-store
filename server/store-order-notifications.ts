import { STORE_ORDER_STATUS_LABELS, type StoreOrder } from "@shared/store-order-schema";
import type { Store } from "@shared/store-schema";
import {
  buildStoreOrderNewNotification,
  buildStoreOrderStatusNotification,
  storePushDataStrings,
} from "@shared/store-notification-copy";
import { genFebStorage } from "./storage-genfeb";
import { getIO, sendNotificationToUser } from "./socket";
import { notificationService } from "./services/notification.service";

function customerDisplayName(user: Record<string, unknown> | null | undefined): string {
  if (!user) return "Cliente";
  const name = String(user.name ?? user.firstName ?? "").trim();
  const lastName = String(user.lastName ?? "").trim();
  return [name, lastName].filter(Boolean).join(" ").trim() || "Cliente";
}

export async function notifyStoreOwnerNewOrder(order: StoreOrder, store: Store): Promise<void> {
  const ownerUserId = String(store.ownerUserId ?? "");
  if (!ownerUserId) return;

  const customer = await genFebStorage.getUserById(order.userId);
  const customerName = customerDisplayName((customer ?? undefined) as Record<string, unknown> | undefined);
  const copy = buildStoreOrderNewNotification({
    storeName: store.name,
    storeSlug: store.slug,
    orderId: order.id,
    customerName,
    amountDue: order.amountDue,
  });

  const data = {
    storeId: order.storeId,
    storeSlug: store.slug,
    storeName: store.name,
    orderId: order.id,
    customerName,
    amountDue: order.amountDue,
    title: copy.title,
    body: copy.body,
    url: copy.url,
  };

  await genFebStorage.createNotification({
    userId: ownerUserId,
    type: "store_order_new",
    data,
  });

  const io = getIO();
  if (io) {
    sendNotificationToUser(io, ownerUserId, { type: "store_order_new", data });
    io.to(`user:${ownerUserId}`).emit("store:order:new", {
      storeId: order.storeId,
      orderId: order.id,
    });
  }

  try {
    await notificationService.sendPushToUser(ownerUserId, {
      title: copy.title,
      body: copy.body,
      data: storePushDataStrings("store_order_new", data),
    });
  } catch {
    /* push opcional */
  }
}

export async function notifyCustomerStoreOrderStatusChanged(order: StoreOrder, store: Store): Promise<void> {
  const customerUserId = String(order.userId);
  if (!customerUserId) return;

  const copy = buildStoreOrderStatusNotification({
    storeName: store.name,
    storeSlug: store.slug,
    orderId: order.id,
    status: order.status,
  });

  const data = {
    storeId: order.storeId,
    storeSlug: store.slug,
    storeName: store.name,
    orderId: order.id,
    status: order.status,
    statusLabel: copy.statusLabel,
    title: copy.title,
    body: copy.body,
    url: copy.url,
  };

  await genFebStorage.createNotification({
    userId: customerUserId,
    type: "store_order_status",
    data,
  });

  const io = getIO();
  if (io) {
    sendNotificationToUser(io, customerUserId, { type: "store_order_status", data });
    io.to(`user:${customerUserId}`).emit("store:order:customer:updated", {
      orderId: order.id,
      status: order.status,
    });
  }

  try {
    await notificationService.sendPushToUser(customerUserId, {
      title: copy.title,
      body: copy.body,
      data: storePushDataStrings("store_order_status", data),
    });
  } catch {
    /* push opcional */
  }
}
