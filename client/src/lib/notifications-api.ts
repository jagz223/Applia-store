/**
 * API de notificaciones: única fuente de verdad desde Firestore.
 * Usado al iniciar sesión para sincronizar el estado de la campana.
 */

import { filterOutWalletRelatedNotifications } from "@/lib/notification-filters";

export interface ClientNotification {
  id: string;
  type: string;
  data: Record<string, unknown>;
  timestamp: Date;
  read: boolean;
}

type ApiNotification = {
  id: number | string;
  type: string;
  data?: Record<string, unknown>;
  read?: boolean;
  createdAt?: Date | string | { toMillis?: () => number; _seconds?: number; _nanoseconds?: number };
};

function parseTimestamp(created: ApiNotification["createdAt"]): Date {
  if (created instanceof Date) return created;
  const c = created as { toMillis?: () => number; _seconds?: number; _nanoseconds?: number } | undefined;
  if (c && typeof c.toMillis === "function") {
    return new Date(c.toMillis());
  }
  // Firestore serializado como JSON devuelve { _seconds, _nanoseconds } en lugar de Date
  if (c && typeof c._seconds === "number") {
    const ms = c._seconds * 1000 + ((c._nanoseconds ?? 0) / 1e6);
    return new Date(ms);
  }
  if (created && typeof created === "string") return new Date(created);
  return new Date();
}

function toClientNotification(apiNotif: ApiNotification): ClientNotification {
  return {
    id: String(apiNotif.id),
    type: apiNotif.type,
    data: apiNotif.data ?? {},
    timestamp: parseTimestamp(apiNotif.createdAt),
    read: Boolean(apiNotif.read),
  };
}

/**
 * Obtiene todas las notificaciones del usuario desde el servidor (Firestore).
 * Debe usarse al iniciar sesión para establecer el estado inicial de la campana.
 */
export async function fetchNotificationsFromServer(token: string): Promise<ClientNotification[]> {
  const res = await fetch("/api/notifications", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const list: ApiNotification[] = await res.json();
  const notifications = filterOutWalletRelatedNotifications(list.map(toClientNotification));
  notifications.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  return notifications;
}
