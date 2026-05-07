/**
 * Chat automático asociado a reservas de servicios (marketplace).
 * Al pasar a "in_progress" se crea/vincula conversación y se notifica por socket (sin forzar navegación).
 * Al "completed" / "cancelled" se programa ocultación para usuarios a las 24h (los datos siguen en BD para admin).
 */

import type { Server as SocketIOServer } from "socket.io";
import { CHAT_SYSTEM_SENDER_ID } from "@shared/chat-constants";
import type { IStorage } from "./storage-genfeb";

export const SERVICE_BOOKING_CHAT_USER_GRACE_MS = 24 * 60 * 60 * 1000;

/**
 * Al crear la reserva (pending): conversación lista para que cliente y asociado negocien antes del servicio.
 */
export async function ensureConversationWhenBookingCreated(
  io: SocketIOServer | null,
  storage: IStorage,
  booking: any,
): Promise<void> {
  const bookingId = Number(booking?.id);
  const clientUid = String(booking?.userId ?? "");
  const providerId = Number(booking?.providerId);
  const serviceId = Number(booking?.serviceId);
  if (!Number.isFinite(bookingId) || !clientUid || !Number.isFinite(providerId) || !Number.isFinite(serviceId)) return;

  try {
    let conv = await storage.findConversationForServiceBooking({
      id: bookingId,
      userId: clientUid,
      providerId,
      serviceId,
    });

    let created = false;
    if (!conv) {
      const provider = await storage.getProvider(providerId);
      const providerUid = provider ? String((provider as { userId?: string }).userId ?? "") : "";
      if (!providerUid) return;
      conv = await storage.createConversation({
        participant1Id: clientUid,
        participant2Id: providerUid,
        serviceId,
        bookingId,
        kind: "service_booking",
      });
      created = true;
    }

    if (created && conv) {
      await storage.createMessage({
        conversationId: Number((conv as any).id),
        senderId: CHAT_SYSTEM_SENDER_ID,
        content:
          "Mensaje del sistema: se creó la reserva. Podéis usar este chat para coordinar detalles y resolver dudas antes del servicio.",
        type: "system",
        status: "sent",
      });
    }

    const convId = Number((conv as any)?.id);
    if (!Number.isFinite(convId)) return;

    if (io) {
      const payload = { conversationId: convId, bookingId };
      io.to(`user:${clientUid}`).emit("service:booking:chat_ready", payload);
      const provider = await storage.getProvider(providerId);
      const pUid = provider ? String((provider as { userId?: string }).userId ?? "") : "";
      if (pUid) io.to(`user:${pUid}`).emit("service:booking:chat_ready", payload);
    }
  } catch (e) {
    console.error("[service-booking-chat] ensureConversationWhenBookingCreated", e);
  }
}

export async function applyServiceBookingChatLifecycle(
  io: SocketIOServer | null,
  storage: IStorage,
  booking: any,
): Promise<void> {
  const status = String(booking?.status ?? "");
  try {
    if (status === "in_progress") {
      await ensureServiceBookingConversation(io, storage, booking);
    }
    if (status === "completed" || status === "cancelled") {
      await markServiceBookingConversationEnding(io, storage, booking);
    }
  } catch (e) {
    console.error("[service-booking-chat] lifecycle", e);
  }
}

async function ensureServiceBookingConversation(
  io: SocketIOServer | null,
  storage: IStorage,
  booking: any,
): Promise<void> {
  const bookingId = Number(booking?.id);
  const clientUid = String(booking?.userId ?? "");
  const providerId = Number(booking?.providerId);
  const serviceId = Number(booking?.serviceId);
  if (!Number.isFinite(bookingId) || !clientUid || !Number.isFinite(providerId) || !Number.isFinite(serviceId)) return;

  let conv = await storage.findConversationForServiceBooking({
    id: bookingId,
    userId: clientUid,
    providerId,
    serviceId,
  });

  let created = false;
  if (!conv) {
    const provider = await storage.getProvider(providerId);
    const providerUid = provider ? String((provider as { userId?: string }).userId ?? "") : "";
    if (!providerUid) return;
    conv = await storage.createConversation({
      participant1Id: clientUid,
      participant2Id: providerUid,
      serviceId,
      bookingId,
      kind: "service_booking",
    });
    created = true;
  } else if (Number((conv as any).bookingId) !== bookingId) {
    await storage.patchConversation(Number((conv as any).id), {
      bookingId,
      kind: "service_booking",
    });
  }

  if (created && conv) {
    await storage.createMessage({
      conversationId: Number((conv as any).id),
      senderId: CHAT_SYSTEM_SENDER_ID,
      content:
        "Mensaje del sistema: el servicio está en curso. Podéis coordinar aquí con la otra parte hasta que la reserva finalice.",
      type: "system",
      status: "sent",
    });
  }

  const convId = Number((conv as any)?.id);
  if (!Number.isFinite(convId)) return;

  if (io) {
    const payload = { conversationId: convId, bookingId };
    io.to(`user:${clientUid}`).emit("service:booking:chat_ready", payload);
    const provider = await storage.getProvider(providerId);
    const pUid = provider ? String((provider as { userId?: string }).userId ?? "") : "";
    if (pUid) io.to(`user:${pUid}`).emit("service:booking:chat_ready", payload);
  }
}

async function markServiceBookingConversationEnding(
  io: SocketIOServer | null,
  storage: IStorage,
  booking: any,
): Promise<void> {
  const bookingId = Number(booking?.id);
  const clientUid = String(booking?.userId ?? "");
  const providerId = Number(booking?.providerId);
  const serviceId = Number(booking?.serviceId);
  if (!Number.isFinite(bookingId)) return;

  const conv = await storage.findConversationForServiceBooking({
    id: bookingId,
    userId: clientUid,
    providerId,
    serviceId,
  });
  if (!conv) return;

  const convId = Number((conv as any).id);
  if (!Number.isFinite(convId)) return;

  const endedAt = new Date();
  const hideAt = new Date(endedAt.getTime() + SERVICE_BOOKING_CHAT_USER_GRACE_MS);
  await storage.patchConversation(convId, {
    serviceEndedAt: endedAt,
    serviceChatHideFromUsersAt: hideAt,
    bookingId,
  });

  if (io) {
    const payload = {
      conversationId: convId,
      bookingId,
      serviceChatHideFromUsersAt: hideAt.toISOString(),
    };
    io.to(`user:${clientUid}`).emit("service:booking:chat_closing", payload);
    const provider = await storage.getProvider(providerId);
    const pUid = provider ? String((provider as { userId?: string }).userId ?? "") : "";
    if (pUid) io.to(`user:${pUid}`).emit("service:booking:chat_closing", payload);
  }
}
