import { storeAdminSectionPath } from "@shared/store-admin-sections";

type StoreOrderNotificationData = Record<string, unknown> | null | undefined;

function readField(data: StoreOrderNotificationData, key: string): unknown {
  const d = data ?? {};
  const nested = (d.data as Record<string, unknown> | undefined) ?? {};
  return d[key] ?? nested[key];
}

function readString(data: StoreOrderNotificationData, key: string): string | null {
  const value = readField(data, key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readOrderId(data: StoreOrderNotificationData): number | string | null {
  const raw = readField(data, "orderId");
  if (raw == null || raw === "") return null;
  return typeof raw === "number" ? raw : String(raw);
}

function customerOrdersPath(data: StoreOrderNotificationData): string {
  const orderId = readOrderId(data);
  return orderId != null ? `/pedidos-tienda?orderId=${orderId}` : "/pedidos-tienda";
}

/** Ruta al hacer clic en notificaciones de órdenes de tienda (cliente o dueño). */
export function resolveStoreOrderNotificationPath(
  type: string,
  data?: StoreOrderNotificationData,
): string | null {
  switch (type) {
    case "store_order_status":
      return customerOrdersPath(data);
    case "store_order_new": {
      const url = readString(data, "url");
      if (url?.startsWith("/")) return url;
      return "/tiendas";
    }
    case "store_order_delivery": {
      const url = readString(data, "url");
      if (url?.startsWith("/")) return url;
      const orderId = readOrderId(data);
      const storeSlug = readString(data, "storeSlug");
      if (storeSlug && orderId != null) {
        return `/tienda/${encodeURIComponent(storeSlug)}/admin/ordenes/delivery/${orderId}`;
      }
      return "/tiendas";
    }
    default:
      return null;
  }
}

export function storeAdminOrdersPath(storeSlug: string): string {
  return `/tienda/${encodeURIComponent(storeSlug)}/admin/${storeAdminSectionPath("ordenes")}`;
}
