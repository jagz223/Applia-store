import type { StoreOrder } from "@shared/store-order-schema";
import type { Store, StoreLocation } from "@shared/store-schema";
import { genFebStorage } from "./storage-genfeb";
import { getIO, sendNotificationToUser } from "./socket";
import { notificationService } from "./services/notification.service";
import {
  buildStoreOrderDeliveryNotification,
  storePushDataStrings,
  type StoreOrderDeliveryEventType,
} from "@shared/store-notification-copy";
import { normalizeStoreLocation } from "@shared/store-schema";
import {
  createPackRideForStoreOrder,
  cancelStoreOrderPackSearch,
  getActivePackRideForStoreOrder,
  type PackRideRecordSnapshot,
} from "./pack-rides";
import { notifyCustomerStoreOrderStatusChanged } from "./store-order-notifications";

export type { StoreOrderDeliveryEventType };

async function getStoreOwnerUserId(storeId: number): Promise<string | null> {
  const store = await genFebStorage.getStoreById(storeId);
  return store?.ownerUserId ? String(store.ownerUserId) : null;
}

export async function notifyStoreOwnerDeliveryEvent(input: {
  storeId: number;
  orderId: number;
  ownerUserId: string;
  eventType: StoreOrderDeliveryEventType;
  preview?: string;
  incrementUnread?: boolean;
  packRideId?: string | null;
}): Promise<void> {
  const store = await genFebStorage.getStoreById(input.storeId);
  if (!store) return;

  const copy = buildStoreOrderDeliveryNotification({
    storeName: store.name,
    storeSlug: store.slug,
    orderId: input.orderId,
    eventType: input.eventType,
    preview: input.preview,
  });

  if (input.incrementUnread !== false) {
    await genFebStorage.incrementStoreOrderDeliveryUnread(input.storeId, input.orderId);
  }

  const data = {
    storeId: input.storeId,
    storeSlug: store.slug,
    storeName: store.name,
    orderId: input.orderId,
    eventType: input.eventType,
    title: copy.title,
    body: copy.body,
    url: copy.url,
    packRideId: input.packRideId ?? null,
  };

  await genFebStorage.createNotification({
    userId: input.ownerUserId,
    type: "store_order_delivery",
    data,
  });

  const io = getIO();
  if (io) {
    sendNotificationToUser(io, input.ownerUserId, {
      type: "store_order_delivery",
      data,
    });
    io.to(`user:${input.ownerUserId}`).emit("store:order:delivery:updated", {
      storeId: input.storeId,
      orderId: input.orderId,
      eventType: input.eventType,
      packRideId: input.packRideId ?? null,
    });
  }

  try {
    await notificationService.sendPushToUser(input.ownerUserId, {
      title: copy.title,
      body: copy.body,
      data: storePushDataStrings("store_order_delivery", data),
    });
  } catch {
    /* push opcional */
  }
}

function requireDeliveryLocations(
  storeLocation: StoreLocation | null,
  deliveryLocation: StoreOrder["deliveryLocation"],
): { start: { lat: number; lon: number; label: string }; end: { lat: number; lon: number; label: string } } {
  if (!storeLocation) throw new Error("STORE_LOCATION_REQUIRED");
  if (!deliveryLocation) throw new Error("STORE_ORDER_DELIVERY_LOCATION_REQUIRED");
  return {
    start: {
      lat: storeLocation.lat,
      lon: storeLocation.lon,
      label: storeLocation.label,
    },
    end: {
      lat: deliveryLocation.lat,
      lon: deliveryLocation.lon,
      label: deliveryLocation.label,
    },
  };
}

/** Inicia búsqueda Pack Go para una orden ya en listo_para_envio. */
export async function launchStoreOrderDeliverySearch(
  order: StoreOrder,
  store: Store,
  ownerUserId: string,
): Promise<StoreOrder> {
  if (order.fulfillmentMode !== "delivery") {
    throw new Error("STORE_ORDER_NOT_DELIVERY");
  }
  if (order.status !== "listo_para_envio") {
    throw new Error("STORE_ORDER_INVALID_STATUS_FOR_DELIVERY_SEARCH");
  }

  const storeLocation = normalizeStoreLocation(store.location ?? null);
  const { start, end } = requireDeliveryLocations(storeLocation, order.deliveryLocation);

  const active = getActivePackRideForStoreOrder(order.id);
  if (active && (active.status === "searching" || active.status === "matched" || active.status === "in_progress")) {
    throw new Error("STORE_ORDER_DELIVERY_SEARCH_ALREADY_ACTIVE");
  }

  const packRideId = await createPackRideForStoreOrder({
    storeOrderId: order.id,
    storeId: order.storeId,
    riderUserId: ownerUserId,
    start,
    end,
    estimatedUsd: Math.max(0, order.deliveryFee),
    distanceM: order.deliveryDistanceM ?? 0,
    vehicleType: "moto",
    paymentMethod: "cash",
  });

  const updated = await genFebStorage.patchStoreOrder(order.storeId, order.id, {
    packRideId,
  });

  await notifyStoreOwnerDeliveryEvent({
    storeId: order.storeId,
    orderId: order.id,
    ownerUserId,
    eventType: "search_started",
    incrementUnread: false,
    packRideId,
  });

  return updated;
}

export async function handleStoreOrderStatusListoParaEnvio(
  storeId: number,
  orderId: number,
  store: Store,
): Promise<StoreOrder> {
  const ownerUserId = String(store.ownerUserId ?? "");
  if (!ownerUserId) throw new Error("STORE_OWNER_REQUIRED");

  const order = await genFebStorage.getStoreOrder(storeId, orderId);
  if (!order) throw new Error("STORE_ORDER_NOT_FOUND");
  if (order.fulfillmentMode !== "delivery") throw new Error("STORE_ORDER_NOT_DELIVERY");

  const storeLocation = normalizeStoreLocation(store.location ?? null);
  requireDeliveryLocations(storeLocation, order.deliveryLocation);

  const withStatus = await genFebStorage.updateStoreOrderStatus(storeId, orderId, "listo_para_envio");
  return launchStoreOrderDeliverySearch(withStatus, store, ownerUserId);
}

export async function handleStoreOrderRevertFromListoParaEnvio(
  storeId: number,
  orderId: number,
): Promise<StoreOrder> {
  const order = await genFebStorage.getStoreOrder(storeId, orderId);
  if (!order) throw new Error("STORE_ORDER_NOT_FOUND");
  if (order.status !== "listo_para_envio") throw new Error("STORE_ORDER_INVALID_STATUS_FOR_REVERT");
  if (order.fulfillmentMode !== "delivery") throw new Error("STORE_ORDER_NOT_DELIVERY");

  cancelStoreOrderPackSearch(orderId);

  return genFebStorage.patchStoreOrder(storeId, orderId, {
    status: "confirmado",
    packRideId: null,
  });
}

async function relaunchAfterDriverCancel(order: StoreOrder, store: Store, ownerUserId: string): Promise<void> {
  const reset = await genFebStorage.patchStoreOrder(order.storeId, order.id, {
    status: "listo_para_envio",
    packRideId: null,
  });
  void notifyCustomerStoreOrderStatusChanged(reset, store).catch((err) =>
    console.error("[stores] notify customer listo_para_envio relaunch", err),
  );
  await launchStoreOrderDeliverySearch(reset, store, ownerUserId);
}

export async function onStoreOrderPackRideMatched(ride: PackRideRecordSnapshot): Promise<void> {
  if (ride.storeOrderId == null || ride.storeId == null || !ride.driverUserId) return;
  const ownerUserId = await getStoreOwnerUserId(ride.storeId);
  if (!ownerUserId) return;

  await genFebStorage.patchStoreOrder(ride.storeId, ride.storeOrderId, {
    packRideId: ride.id,
  });

  await notifyStoreOwnerDeliveryEvent({
    storeId: ride.storeId,
    orderId: ride.storeOrderId,
    ownerUserId,
    eventType: "driver_accepted",
    packRideId: ride.id,
  });
}

async function notifyCustomerOrderStatusFromStore(storeId: number, orderId: number): Promise<void> {
  const store = await genFebStorage.getStoreById(storeId);
  const order = await genFebStorage.getStoreOrder(storeId, orderId);
  if (!store || !order) return;
  await notifyCustomerStoreOrderStatusChanged(order, store);
}

export async function onStoreOrderPackRideStarted(ride: PackRideRecordSnapshot): Promise<void> {
  if (ride.storeOrderId == null || ride.storeId == null) return;
  const ownerUserId = await getStoreOwnerUserId(ride.storeId);
  if (!ownerUserId) return;

  const order = await genFebStorage.getStoreOrder(ride.storeId, ride.storeOrderId);
  if (!order) return;

  if (order.status === "listo_para_envio") {
    await genFebStorage.patchStoreOrder(ride.storeId, ride.storeOrderId, {
      status: "enviado",
      packRideId: ride.id,
    });
    void notifyCustomerOrderStatusFromStore(ride.storeId, ride.storeOrderId).catch((err) =>
      console.error("[stores] notify customer enviado", err),
    );
  }

  await notifyStoreOwnerDeliveryEvent({
    storeId: ride.storeId,
    orderId: ride.storeOrderId,
    ownerUserId,
    eventType: "driver_started",
    packRideId: ride.id,
  });
}

export async function onStoreOrderPackRideCancelledByDriver(ride: PackRideRecordSnapshot): Promise<void> {
  if (ride.storeOrderId == null || ride.storeId == null) return;
  const store = await genFebStorage.getStoreById(ride.storeId);
  if (!store) return;
  const ownerUserId = String(store.ownerUserId ?? "");
  if (!ownerUserId) return;

  const order = await genFebStorage.getStoreOrder(ride.storeId, ride.storeOrderId);
  if (!order) return;

  if (order.status === "enviado" || order.status === "listo_para_envio") {
    await relaunchAfterDriverCancel(order, store, ownerUserId);
    await notifyStoreOwnerDeliveryEvent({
      storeId: order.storeId,
      orderId: order.id,
      ownerUserId,
      eventType: "driver_cancelled",
      packRideId: null,
    });
  }
}

export async function onStoreOrderPackRideCompleted(ride: PackRideRecordSnapshot): Promise<void> {
  if (ride.storeOrderId == null || ride.storeId == null) return;
  const ownerUserId = await getStoreOwnerUserId(ride.storeId);
  if (!ownerUserId) return;

  await genFebStorage.patchStoreOrder(ride.storeId, ride.storeOrderId, {
    status: "completado",
    packRideId: ride.id,
  });

  void notifyCustomerOrderStatusFromStore(ride.storeId, ride.storeOrderId).catch((err) =>
    console.error("[stores] notify customer completado", err),
  );

  await notifyStoreOwnerDeliveryEvent({
    storeId: ride.storeId,
    orderId: ride.storeOrderId,
    ownerUserId,
    eventType: "driver_completed",
    packRideId: ride.id,
  });
}

export async function onStoreOrderDeliveryChatMessage(input: {
  mobilityRideId: string;
  senderUserId: string;
  recipientUserId: string;
  preview: string;
}): Promise<void> {
  const ride = getActivePackRideForStoreOrder(undefined, input.mobilityRideId);
  if (!ride?.storeOrderId || !ride.storeId) return;

  const ownerUserId = await getStoreOwnerUserId(ride.storeId);
  if (!ownerUserId || input.recipientUserId !== ownerUserId) return;
  if (input.senderUserId === ownerUserId) return;
  if (!ride.driverUserId || input.senderUserId !== ride.driverUserId) return;

  await notifyStoreOwnerDeliveryEvent({
    storeId: ride.storeId,
    orderId: ride.storeOrderId,
    ownerUserId,
    eventType: "driver_message",
    preview: input.preview,
    packRideId: ride.id,
  });
}

export async function getStoreDeliveryNotificationsSummary(storeId: number): Promise<{
  totalUnread: number;
  byOrderId: Record<number, number>;
}> {
  const orders = await genFebStorage.listStoreOrders(storeId, { deliveryQueue: true });
  let totalUnread = 0;
  const byOrderId: Record<number, number> = {};
  for (const o of orders) {
    const n = Math.max(0, o.deliveryUnreadCount ?? 0);
    if (n > 0) byOrderId[o.id] = n;
    totalUnread += n;
  }
  return { totalUnread, byOrderId };
}
