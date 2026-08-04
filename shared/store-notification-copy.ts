import {
  STORE_ORDER_STATUS_LABELS,
  type StoreOrderStatus,
} from "./store-order-schema";
import { storeAdminSectionPath } from "./store-admin-sections";

export type StoreOrderDeliveryEventType =
  | "search_started"
  | "driver_accepted"
  | "driver_started"
  | "driver_cancelled"
  | "driver_completed"
  | "driver_message";

export type StoreNotificationPayload = {
  title: string;
  body: string;
  url: string;
};

function formatMoney(value: number): string {
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(value);
}

function readString(data: Record<string, unknown> | null | undefined, key: string): string | null {
  const d = data ?? {};
  const nested = (d.data as Record<string, unknown> | undefined) ?? {};
  const value = d[key] ?? nested[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readOrderId(data: Record<string, unknown> | null | undefined): number | null {
  const d = data ?? {};
  const nested = (d.data as Record<string, unknown> | undefined) ?? {};
  const raw = d.orderId ?? nested.orderId;
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number.parseInt(String(raw), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Comprador: mis pedidos de tienda. */
export function storeCustomerOrdersPath(orderId?: number | null): string {
  return orderId != null ? `/pedidos-tienda?orderId=${orderId}` : "/pedidos-tienda";
}

/** Dueño: panel de órdenes de su tienda. */
export function storeOwnerOrdersAdminPath(storeSlug: string, orderId?: number | null): string {
  const base = `/tienda/${encodeURIComponent(storeSlug)}/admin/${storeAdminSectionPath("ordenes")}`;
  return orderId != null ? `${base}?orderId=${orderId}` : base;
}

/** Dueño: seguimiento delivery Pack Go de una orden. */
export function storeOwnerDeliveryAdminPath(storeSlug: string, orderId: number): string {
  return `/tienda/${encodeURIComponent(storeSlug)}/admin/ordenes/delivery/${orderId}`;
}

export function storeVitrinaPath(storeSlug: string): string {
  return `/tienda/${encodeURIComponent(storeSlug)}`;
}

export function storeSubscriptionPaymentPath(storeSlug: string): string {
  return `/tienda/${encodeURIComponent(storeSlug)}/pago`;
}

export function buildStoreOrderNewNotification(input: {
  storeName: string;
  storeSlug: string;
  orderId: number;
  customerName: string;
  amountDue: number;
}): StoreNotificationPayload {
  const title = `Nueva compra · ${input.storeName}`;
  const body = `${input.customerName} · Pedido #${input.orderId} · ${formatMoney(input.amountDue)}`;
  const url = storeOwnerOrdersAdminPath(input.storeSlug, input.orderId);
  return { title, body, url };
}

export function buildStoreOrderStatusNotification(input: {
  storeName: string;
  storeSlug: string;
  orderId: number;
  status: StoreOrderStatus;
}): StoreNotificationPayload & { statusLabel: string } {
  const statusLabel = STORE_ORDER_STATUS_LABELS[input.status];
  const url = storeCustomerOrdersPath(input.orderId);

  switch (input.status) {
    case "pagado":
      return {
        title: `Comprobante enviado · ${input.storeName}`,
        body: `Pedido #${input.orderId}: la tienda revisará tu pago.`,
        url,
        statusLabel,
      };
    case "confirmado":
      return {
        title: `Pedido confirmado · ${input.storeName}`,
        body: `Pedido #${input.orderId} fue confirmado por la tienda.`,
        url,
        statusLabel,
      };
    case "listo_para_envio":
      return {
        title: `Listo para envío · ${input.storeName}`,
        body: `Pedido #${input.orderId}: la tienda prepara el delivery.`,
        url,
        statusLabel,
      };
    case "enviado":
      return {
        title: `Pedido en camino · ${input.storeName}`,
        body: `Pedido #${input.orderId}: tu compra va en camino.`,
        url,
        statusLabel,
      };
    case "listo_pickup":
      return {
        title: `Listo para recoger · ${input.storeName}`,
        body: `Pedido #${input.orderId}: puedes pasar a recoger tu compra.`,
        url,
        statusLabel,
      };
    case "listo_local":
      return {
        title: `Listo en el local · ${input.storeName}`,
        body: `Pedido #${input.orderId}: tu pedido te espera en la tienda.`,
        url,
        statusLabel,
      };
    case "completado":
      return {
        title: `Pedido completado · ${input.storeName}`,
        body: `Pedido #${input.orderId} en ${input.storeName} fue completado.`,
        url,
        statusLabel,
      };
    case "rechazado":
      return {
        title: `Pedido rechazado · ${input.storeName}`,
        body: `Pedido #${input.orderId}: la tienda no pudo confirmar tu orden.`,
        url,
        statusLabel,
      };
    default:
      return {
        title: `Pedido #${input.orderId} · ${input.storeName}`,
        body: `Tu pedido ahora está: ${statusLabel}.`,
        url,
        statusLabel,
      };
  }
}

export function buildStoreOrderDeliveryNotification(input: {
  storeName: string;
  storeSlug: string;
  orderId: number;
  eventType: StoreOrderDeliveryEventType;
  preview?: string;
}): StoreNotificationPayload {
  const url = storeOwnerDeliveryAdminPath(input.storeSlug, input.orderId);
  const prefix = `${input.storeName} · Pedido #${input.orderId}`;

  switch (input.eventType) {
    case "search_started":
      return {
        title: "Buscando repartidor",
        body: `${prefix}: se inició la búsqueda de delivery.`,
        url,
      };
    case "driver_accepted":
      return {
        title: "Repartidor asignado",
        body: `${prefix}: un conductor aceptó el envío.`,
        url,
      };
    case "driver_started":
      return {
        title: "Envío en camino",
        body: `${prefix}: el conductor salió con tu pedido.`,
        url,
      };
    case "driver_cancelled":
      return {
        title: "Repartidor canceló",
        body: `${prefix}: se reinició la búsqueda de delivery.`,
        url,
      };
    case "driver_completed":
      return {
        title: "Entrega completada",
        body: `${prefix}: el conductor marcó el envío como entregado.`,
        url,
      };
    case "driver_message":
      return {
        title: `Mensaje del repartidor · Pedido #${input.orderId}`,
        body: (input.preview ?? "").trim() || `${prefix}: tienes un mensaje del conductor.`,
        url,
      };
    default:
      return {
        title: "Actualización de delivery",
        body: `${prefix}: hay novedades en el envío.`,
        url,
      };
  }
}

export function buildStoreSubscriptionApprovedNotification(input: {
  storeName: string;
  storeSlug: string;
}): StoreNotificationPayload {
  return {
    title: "Tienda activa",
    body: `Tu pago de «${input.storeName}» fue verificado. Ya puedes vender en Applia.`,
    url: storeVitrinaPath(input.storeSlug),
  };
}

export function buildStoreSubscriptionRejectedNotification(input: {
  storeName: string;
  storeSlug: string;
  rejectReason: string;
}): StoreNotificationPayload {
  return {
    title: "Pago de tienda rechazado",
    body: `«${input.storeName}»: ${input.rejectReason}`,
    url: storeSubscriptionPaymentPath(input.storeSlug),
  };
}

export function buildAdminStoreSubscriptionPendingNotification(input: {
  storeName: string;
  ownerName: string;
}): StoreNotificationPayload {
  return {
    title: "Pago de tienda pendiente",
    body: `${input.ownerName} envió comprobante para «${input.storeName}».`,
    url: "/admin?tab=store-payments",
  };
}

/** Título en campana / historial (cliente). */
export function getStoreNotificationTitle(type: string, data?: Record<string, unknown> | null): string | null {
  const stored = readString(data, "title");
  if (stored) return stored;

  const storeName = readString(data, "storeName") ?? "Tienda";
  const orderId = readOrderId(data);

  switch (type) {
    case "store_order_new":
      return orderId != null ? `Nueva compra · ${storeName}` : "Nueva compra en tu tienda";
    case "store_order_status":
      return orderId != null ? `Pedido #${orderId} · ${storeName}` : "Actualización de tu pedido";
    case "store_order_delivery": {
      const eventType = readString(data, "eventType");
      if (eventType === "driver_message") {
        return orderId != null ? `Mensaje del repartidor · #${orderId}` : "Mensaje del repartidor";
      }
      if (eventType === "driver_accepted") return "Repartidor asignado";
      if (eventType === "driver_started") return "Envío en camino";
      if (eventType === "driver_completed") return "Entrega completada";
      if (eventType === "driver_cancelled") return "Repartidor canceló";
      if (eventType === "search_started") return "Buscando repartidor";
      return orderId != null ? `Delivery · Pedido #${orderId}` : "Delivery de tu tienda";
    }
    case "store_subscription_result": {
      const status = readString(data, "status");
      if (status === "approved") return "Tienda activa";
      if (status === "rejected") return "Pago de tienda rechazado";
      return "Suscripción de tienda";
    }
    case "admin_store_subscription_payment":
      return "Pago de tienda pendiente";
    default:
      return null;
  }
}

/** Descripción en campana / historial. */
export function getStoreNotificationBody(type: string, data?: Record<string, unknown> | null): string | null {
  const stored = readString(data, "body") ?? readString(data, "message");
  if (stored) return stored;

  const orderId = readOrderId(data);
  const statusLabel = readString(data, "statusLabel");

  switch (type) {
    case "store_order_new":
      return orderId != null
        ? `Tienes una nueva orden #${orderId} por revisar.`
        : "Tienes una nueva compra en tu tienda.";
    case "store_order_status":
      return statusLabel
        ? `Tu pedido ahora está: ${statusLabel}.`
        : "El estado de tu pedido fue actualizado.";
    case "store_order_delivery":
      return orderId != null
        ? `Novedades en el delivery del pedido #${orderId}.`
        : "Actualización del delivery de una orden.";
    case "store_subscription_result": {
      const status = readString(data, "status");
      if (status === "approved") return "Tu comprobante fue verificado. Tu tienda ya está visible.";
      if (status === "rejected") return "Revisa el motivo y vuelve a enviar el comprobante.";
      return "Resultado del pago de suscripción de tu tienda.";
    }
    case "admin_store_subscription_payment":
      return "Un dueño de tienda envió un comprobante de mensualidad.";
    default:
      return null;
  }
}

/** Ruta al hacer clic (cliente o push). */
export function resolveStoreNotificationPath(
  type: string,
  data?: Record<string, unknown> | null,
): string | null {
  const url = readString(data, "url");
  if (url?.startsWith("/")) return url;

  const storeSlug = readString(data, "storeSlug");
  const orderId = readOrderId(data);

  switch (type) {
    case "store_order_status":
      return storeCustomerOrdersPath(orderId);
    case "store_order_new":
      return storeSlug ? storeOwnerOrdersAdminPath(storeSlug, orderId) : "/tiendas";
    case "store_order_delivery":
      if (storeSlug && orderId != null) return storeOwnerDeliveryAdminPath(storeSlug, orderId);
      return storeSlug ? storeOwnerOrdersAdminPath(storeSlug, orderId) : "/tiendas";
    case "store_subscription_result": {
      const status = readString(data, "status");
      if (storeSlug && status === "rejected") return storeSubscriptionPaymentPath(storeSlug);
      if (storeSlug) return storeVitrinaPath(storeSlug);
      return "/dashboard";
    }
    case "admin_store_subscription_payment":
      return "/admin?tab=store-payments";
    default:
      return null;
  }
}

export function storePushDataStrings(
  type: string,
  data: Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = { type };
  for (const [key, value] of Object.entries(data)) {
    if (value == null) continue;
    out[key] = typeof value === "string" ? value : String(value);
  }
  return out;
}
