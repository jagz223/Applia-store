import { storeAdminSectionPath } from "@shared/store-admin-sections";
import { resolveStoreOrderNotificationPath } from "@/lib/store-order-notification-path";
import { resolveStoreNotificationPath } from "@shared/store-notification-copy";

function readString(data: Record<string, unknown>, key: string): string | null {
  const nested = (data.data as Record<string, unknown> | undefined) ?? {};
  const value = data[key] ?? nested[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function storeAdminConfigPath(storeSlug: string): string {
  return `/tienda/${encodeURIComponent(storeSlug)}/admin/${storeAdminSectionPath("configuracion")}`;
}

/** Destino al pulsar una notificación (solo rutas del flujo Store). */
export function getStoreNotificationPath(notification: {
  id?: string;
  type: string;
  data?: Record<string, unknown>;
}): string {
  const data = notification.data ?? {};

  const storePath = resolveStoreNotificationPath(notification.type, data);
  if (storePath) return storePath;

  const storeOrderPath = resolveStoreOrderNotificationPath(notification.type, data);
  if (storeOrderPath) return storeOrderPath;

  const nestedType = data.type ?? (data.data as Record<string, unknown> | undefined)?.type;
  if (typeof nestedType === "string" && nestedType !== notification.type) {
    const nestedPath = resolveStoreOrderNotificationPath(nestedType, data);
    if (nestedPath) return nestedPath;
  }

  const serverUrl = readString(data, "url");
  if (serverUrl?.startsWith("/tienda") || serverUrl?.startsWith("/pedidos-tienda") || serverUrl?.startsWith("/settings")) {
    return serverUrl;
  }

  switch (notification.type) {
    case "store_subscription_result": {
      const storeSlug = readString(data, "storeSlug");
      const status = readString(data, "status");
      if (status === "rejected" && storeSlug) {
        return `/tienda/${encodeURIComponent(storeSlug)}/pago`;
      }
      if (storeSlug) return storeAdminConfigPath(storeSlug);
      return "/settings";
    }
    case "admin_store_subscription_payment": {
      const storeSlug = readString(data, "storeSlug");
      if (storeSlug) return storeAdminConfigPath(storeSlug);
      return "/notifications";
    }
    case "account_change_request_approved":
    case "account_change_request_rejected":
      return serverUrl ?? "/settings";
    case "admin":
      if (data.type === "go_panic" && notification.id) {
        return `/notifications?detail=${encodeURIComponent(String(notification.id))}`;
      }
      return serverUrl ?? "/notifications";
    default:
      return "/notifications";
  }
}
