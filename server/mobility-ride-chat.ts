/**
 * Chat de viajes Go (taxi / delivery): persistido en BD aunque el viaje viva solo en memoria.
 * Si el viaje no se completa (cancelación, reinicio del servidor, abandono), el hilo deja de
 * mostrarse a los usuarios tras 24 h (serviceChatHideFromUsersAt).
 */

import type { Server as SocketIOServer } from "socket.io";
import { CHAT_SYSTEM_SENDER_ID } from "@shared/chat-constants";
import type { IStorage } from "./storage-genfeb";
import { getIO } from "./socket";

export const MOBILITY_RIDE_CHAT_USER_GRACE_MS = 24 * 60 * 60 * 1000;

const MSG_OPENING_GRACE =
  "Chat del viaje. Si el trayecto no se completa, este hilo desaparecerá de tu lista en 24 horas.";

const MSG_CANCELLED_GRACE =
  "El viaje no se completó. Este chat desaparecerá de tu lista en 24 horas.";

const MSG_COMPLETED =
  "Viaje completado. Este chat quedó cerrado y desaparecerá de tu lista.";

export type MobilityRideChatModule = "taxi" | "delivery";

function hideAtFromNow(): Date {
  return new Date(Date.now() + MOBILITY_RIDE_CHAT_USER_GRACE_MS);
}

/** Al emparejar conductor ↔ pasajero (creación del hilo). */
export async function registerMobilityRideChatCreated(
  storage: IStorage,
  params: {
    conversationId: number;
    rideId: string;
    module: MobilityRideChatModule;
    riderUserId?: string;
    driverUserId?: string;
  },
): Promise<void> {
  const id = Number(params.conversationId);
  if (!Number.isFinite(id) || id <= 0) return;

  await storage.patchConversation(id, {
    kind: "mobility_ride",
    mobilityRideId: String(params.rideId),
    mobilityRideModule: params.module,
    mobilityRideCompleted: false,
    mobilityRideInProgress: false,
    /** Sin fecha de ocultación hasta cancelar / no completar / finalizar (evita banner «servicio inactivo» en viaje nuevo). */
    serviceChatHideFromUsersAt: null,
    messagesLocked: false,
  });

  try {
    await storage.createMessage({
      conversationId: id,
      senderId: CHAT_SYSTEM_SENDER_ID,
      content: MSG_OPENING_GRACE,
      type: "system",
      status: "read",
    });
  } catch (e) {
    console.error("[mobility-ride-chat] register created message", e);
  }

  const riderUid = String(params.riderUserId ?? "").trim();
  const driverUid = String(params.driverUserId ?? "").trim();
  if (!riderUid || !driverUid) return;
  try {
    const io = getIO();
    if (!io) return;
    const payload = { conversationId: String(id), preview: "Chat del viaje" };
    io.to(`user:${riderUid}`).emit("notification:message", payload);
    io.to(`user:${driverUid}`).emit("notification:message", payload);
  } catch (e) {
    console.error("[mobility-ride-chat] notify created", e);
  }
}

/** Viaje iniciado: no auto-ocultar mientras está en curso. */
export async function onMobilityRideChatStarted(storage: IStorage, conversationId: number | null | undefined): Promise<void> {
  const id = Number(conversationId);
  if (!Number.isFinite(id) || id <= 0) return;
  await storage.patchConversation(id, {
    serviceChatHideFromUsersAt: null,
    mobilityRideInProgress: true,
    messagesLocked: false,
  });
}

/** Viaje completado: ocultar de inmediato en listados de usuario. */
export async function onMobilityRideChatCompleted(
  storage: IStorage,
  params: { conversationId: number; riderUserId: string; driverUserId: string },
): Promise<void> {
  const id = Number(params.conversationId);
  if (!Number.isFinite(id) || id <= 0) return;

  const endedAt = new Date();
  await storage.patchConversation(id, {
    mobilityRideCompleted: true,
    mobilityRideInProgress: false,
    messagesLocked: true,
    serviceEndedAt: endedAt,
    serviceChatHideFromUsersAt: endedAt,
  });

  try {
    await storage.createMessage({
      conversationId: id,
      senderId: CHAT_SYSTEM_SENDER_ID,
      content: MSG_COMPLETED,
      type: "system",
      status: "read",
    });
  } catch (e) {
    console.error("[mobility-ride-chat] completed message", e);
  }

  try {
    await storage.hideConversationForUsers(id, [params.riderUserId, params.driverUserId]);
  } catch (e) {
    console.error("[mobility-ride-chat] hide completed", e);
  }
}

/** Cancelación explícita del viaje: ocultar el chat de inmediato en listados de usuario. */
export async function onMobilityRideChatCancelled(
  storage: IStorage,
  params: { conversationId: number; riderUserId: string; driverUserId: string },
): Promise<void> {
  const id = Number(params.conversationId);
  if (!Number.isFinite(id) || id <= 0) return;

  const endedAt = new Date();
  await storage.patchConversation(id, {
    mobilityRideCompleted: false,
    mobilityRideInProgress: false,
    messagesLocked: true,
    serviceEndedAt: endedAt,
    serviceChatHideFromUsersAt: endedAt,
  });

  try {
    await storage.hideConversationForUsers(id, [params.riderUserId, params.driverUserId]);
  } catch (e) {
    console.error("[mobility-ride-chat] hide cancelled", e);
  }
}

/** Fin sin completar (p. ej. abandono): gracia de 24 h desde ahora. */
export async function onMobilityRideChatNotCompleted(
  storage: IStorage,
  params: { conversationId: number },
): Promise<void> {
  const id = Number(params.conversationId);
  if (!Number.isFinite(id) || id <= 0) return;

  const hideAt = hideAtFromNow();
  await storage.patchConversation(id, {
    mobilityRideCompleted: false,
    mobilityRideInProgress: false,
    messagesLocked: true,
    serviceEndedAt: new Date(),
    serviceChatHideFromUsersAt: hideAt,
  });

  try {
    await storage.createMessage({
      conversationId: id,
      senderId: CHAT_SYSTEM_SENDER_ID,
      content: MSG_CANCELLED_GRACE,
      type: "system",
      status: "read",
    });
  } catch (e) {
    console.error("[mobility-ride-chat] not-completed message", e);
  }
}

function conversationCreatedAtMs(c: Record<string, unknown>): number | null {
  const t = c.createdAt;
  if (t instanceof Date) return t.getTime();
  if (typeof (t as { toMillis?: () => number })?.toMillis === "function") return (t as { toMillis: () => number }).toMillis();
  if (typeof t === "number" && Number.isFinite(t)) return t;
  if (typeof t === "string") {
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? null : d.getTime();
  }
  return null;
}

function hideAtMs(c: Record<string, unknown>): number | null {
  const t = c.serviceChatHideFromUsersAt;
  if (t == null) return null;
  if (t instanceof Date) return t.getTime();
  if (typeof (t as { toMillis?: () => number }).toMillis === "function") return (t as { toMillis: () => number }).toMillis();
  if (typeof t === "string") {
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? null : d.getTime();
  }
  return null;
}

/**
 * Tras reinicio del servidor: hilos de viaje sin completar cuyo plazo de 24 h ya venció
 * (o sin fecha programada pero creados hace más de 24 h).
 */
export async function sweepStaleMobilityRideChats(storage: IStorage): Promise<number> {
  if (typeof storage.sweepStaleMobilityRideChats === "function") {
    return storage.sweepStaleMobilityRideChats();
  }
  return 0;
}

/** Utilidad para tests / storage interno. */
export function mobilityRideChatShouldBeHidden(c: Record<string, unknown>, nowMs = Date.now()): boolean {
  if (c.mobilityRideCompleted === true) {
    const hideMs = hideAtMs(c);
    return hideMs != null && nowMs >= hideMs;
  }
  const hideMs = hideAtMs(c);
  if (hideMs != null && nowMs >= hideMs) return true;
  const created = conversationCreatedAtMs(c);
  if (created != null && nowMs >= created + MOBILITY_RIDE_CHAT_USER_GRACE_MS) {
    return true;
  }
  return false;
}

export async function runMobilityRideChatStartupSweep(storage: IStorage): Promise<void> {
  try {
    const n = await sweepStaleMobilityRideChats(storage);
    if (n > 0) {
      console.info(`[mobility-ride-chat] sweep: ${n} hilo(s) de viaje marcados como ocultos`);
    }
  } catch (e) {
    console.error("[mobility-ride-chat] startup sweep failed", e);
  }
}
