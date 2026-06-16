import { STORE_ORDER_STATUS_LABELS, type StoreOrder } from "@shared/store-order-schema";
import { storeAdminSectionPath } from "@shared/store-admin-sections";
import type { Store } from "@shared/store-schema";
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
  const customerRec = (customer ?? undefined) as Record<string, unknown> | undefined;
  const customerName = customerDisplayName(customerRec);
  const adminUrl = `/tienda/${encodeURIComponent(store.slug)}/admin/${storeAdminSectionPath("ordenes")}`;

  const title = "Nueva orden";
  const body = `${customerName} realizó la orden #${order.id} · ${formatMoney(order.amountDue)}`;

  const data = {
    storeId: order.storeId,
    orderId: order.id,
    customerName,
    amountDue: order.amountDue,
    url: adminUrl,
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
      title,
      body,
      data: { type: "store_order_new", storeId: String(order.storeId), orderId: String(order.id), url: adminUrl },
    });
  } catch {
    /* push opcional */
  }
}

export async function notifyCustomerStoreOrderStatusChanged(order: StoreOrder, store: Store): Promise<void> {
  const customerUserId = String(order.userId);
  if (!customerUserId) return;

  const statusLabel = STORE_ORDER_STATUS_LABELS[order.status];
  const title = `Pedido #${order.id} · ${store.name}`;
  const body = `Tu orden ahora está: ${statusLabel}.`;
  const url = `/pedidos-tienda?orderId=${order.id}`;

  const data = {
    storeId: order.storeId,
    orderId: order.id,
    storeName: store.name,
    status: order.status,
    statusLabel,
    url,
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
      title,
      body,
      data: {
        type: "store_order_status",
        storeId: String(order.storeId),
        orderId: String(order.id),
        url,
      },
    });
  } catch {
    /* push opcional */
  }
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(value);
}
