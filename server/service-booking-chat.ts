/**
 * Chat automático asociado a reservas de servicios (marketplace).
 * Al pasar a "in_progress" se crea/vincula conversación y se notifica por socket (sin forzar navegación).
 * Al "completed" / "cancelled" se programa ocultación para usuarios a las 24h (los datos siguen en BD para admin).
 */

import type { Server as SocketIOServer } from "socket.io";
import { CHAT_SYSTEM_SENDER_ID } from "@shared/chat-constants";
import type { IStorage } from "./storage-applia";

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
  const status = String(booking?.status ?? "");
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
  const endWord = status === "completed" ? "completada" : "cancelada";
  try {
    await storage.createMessage({
      conversationId: convId,
      senderId: CHAT_SYSTEM_SENDER_ID,
      content: `Mensaje del sistema: la reserva #${bookingId} quedó ${endWord}. Este chat quedó cerrado: no podrán enviar más mensajes. Desaparecerá de tu lista en 24 h.`,
      type: "system",
      status: "read",
    });
  } catch (e) {
    console.error("[service-booking-chat] mensaje de cierre:", e);
  }

  await storage.patchConversation(convId, {
    serviceEndedAt: endedAt,
    serviceChatHideFromUsersAt: hideAt,
    bookingId,
    messagesLocked: true,
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
    const preview = "Mensaje del sistema";
    io.to(`user:${clientUid}`).emit("notification:message", { conversationId: String(convId), preview });
    if (pUid) io.to(`user:${pUid}`).emit("notification:message", { conversationId: String(convId), preview });
  }
}

function toMillisBookingDate(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v instanceof Date) return v.getTime();
  const any = v as { toMillis?: () => number; _seconds?: number };
  if (typeof any.toMillis === "function") return any.toMillis();
  if (typeof any._seconds === "number") return any._seconds * 1000;
  const t = new Date(String(v)).getTime();
  return Number.isNaN(t) ? null : t;
}

function formatBookingDateForChat(dateVal: unknown): string {
  try {
    const ms = toMillisBookingDate(dateVal);
    if (ms == null) return "—";
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("es-EC", { dateStyle: "long", timeStyle: "short" });
  } catch {
    return "—";
  }
}

function statusLabelEs(status: string): string {
  const map: Record<string, string> = {
    pending: "Pendiente",
    confirmed: "Confirmada",
    in_progress: "En proceso",
    completed: "Completada",
    cancelled: "Cancelada",
  };
  return map[status] ?? status;
}

async function getConversationContextForBooking(
  storage: IStorage,
  booking: { id?: number; userId?: string; providerId?: number; serviceId?: number },
): Promise<{ conv: any; clientUid: string; providerUid: string } | null> {
  const bookingId = Number(booking?.id);
  const clientUid = String(booking?.userId ?? "");
  const providerId = Number(booking?.providerId);
  const serviceId = Number(booking?.serviceId);
  if (!Number.isFinite(bookingId) || !clientUid || !Number.isFinite(providerId) || !Number.isFinite(serviceId)) {
    return null;
  }

  let conv = await storage.findConversationForServiceBooking({
    id: bookingId,
    userId: clientUid,
    providerId,
    serviceId,
  });
  const provider = await storage.getProvider(providerId);
  const providerUid = provider ? String((provider as { userId?: string }).userId ?? "") : "";
  if (!providerUid) return null;

  if (!conv) {
    conv = await storage.createConversation({
      participant1Id: clientUid,
      participant2Id: providerUid,
      serviceId,
      bookingId,
      kind: "service_booking",
    });
  } else if (Number((conv as any).bookingId) !== bookingId) {
    await storage.patchConversation(Number((conv as any).id), { bookingId, kind: "service_booking" });
  }
  return { conv, clientUid, providerUid };
}

export async function appendServiceBookingSystemChatMessage(
  io: SocketIOServer | null,
  storage: IStorage,
  booking: { id?: number; userId?: string; providerId?: number; serviceId?: number },
  content: string,
): Promise<void> {
  const ctx = await getConversationContextForBooking(storage, booking);
  if (!ctx) return;
  const convId = Number((ctx.conv as any).id);
  if (!Number.isFinite(convId)) return;
  const text = content.trim();
  if (!text) return;

  await storage.createMessage({
    conversationId: convId,
    senderId: CHAT_SYSTEM_SENDER_ID,
    content: text,
    type: "system",
    status: "read",
  });

  if (io) {
    const preview = "Mensaje del sistema";
    io.to(`user:${ctx.clientUid}`).emit("notification:message", { conversationId: String(convId), preview });
    io.to(`user:${ctx.providerUid}`).emit("notification:message", { conversationId: String(convId), preview });
  }
}

export async function notifyBookingStatusChangedInChat(
  io: SocketIOServer | null,
  storage: IStorage,
  booking: any,
  previousStatus: string,
  newStatus: string,
): Promise<void> {
  const bookingId = Number(booking?.id);
  const serviceId = Number(booking?.serviceId);
  if (!Number.isFinite(bookingId) || !Number.isFinite(serviceId)) return;
  const svc = await storage.getService(serviceId);
  const title = (svc as { title?: string } | undefined)?.title ?? "Servicio";
  const dateLine = formatBookingDateForChat((booking as { date?: unknown }).date);
  const body = [
    `Reserva #${bookingId} — ${title}`,
    `Estado: ${statusLabelEs(previousStatus)} → ${statusLabelEs(newStatus)}`,
    `Fecha del servicio: ${dateLine}`,
  ].join("\n");
  await appendServiceBookingSystemChatMessage(io, storage, booking, body);
}

export async function notifyBookingConfirmClientInChat(
  io: SocketIOServer | null,
  storage: IStorage,
  booking: any,
  updated: any,
  opts: { amountFormatted: string; offPlatform: boolean },
): Promise<void> {
  const bookingId = Number(booking?.id);
  const serviceId = Number(booking?.serviceId);
  if (!Number.isFinite(bookingId) || !Number.isFinite(serviceId)) return;
  const svc = await storage.getService(serviceId);
  const title = (svc as { title?: string } | undefined)?.title ?? "Servicio";
  const dateLine = formatBookingDateForChat((updated as { date?: unknown }).date);
  const payLine = opts.offPlatform
    ? opts.amountFormatted
      ? `Monto acordado: $${opts.amountFormatted} USD (acuerdo fuera de wallet).`
      : "El cliente confirmó el acuerdo de pago."
    : opts.amountFormatted
      ? `Monto retenido: $${opts.amountFormatted} USD.`
      : "El cliente confirmó el pago (fondos retenidos).";
  const body = [
    `Reserva #${bookingId} — ${title}`,
    opts.offPlatform
      ? "El cliente confirmó el acuerdo."
      : "El cliente confirmó el pago; los fondos quedan retenidos a favor del asociado.",
    payLine,
    `Fecha del servicio: ${dateLine}`,
  ].join("\n");
  await appendServiceBookingSystemChatMessage(io, storage, booking, body);
}

export async function notifyBookingCostChangedInChat(
  io: SocketIOServer | null,
  storage: IStorage,
  booking: any,
  updated: any,
  amountFormatted: string,
): Promise<void> {
  const bookingId = Number(booking?.id);
  const serviceId = Number(booking?.serviceId);
  if (!Number.isFinite(bookingId) || !Number.isFinite(serviceId)) return;
  const svc = await storage.getService(serviceId);
  const title = (svc as { title?: string } | undefined)?.title ?? "Servicio";
  const dateLine = formatBookingDateForChat((updated as { date?: unknown }).date);
  const body = [
    `Reserva #${bookingId} — ${title}`,
    `Se actualizó el monto a $${amountFormatted} USD.`,
    `Fecha del servicio: ${dateLine}`,
  ].join("\n");
  await appendServiceBookingSystemChatMessage(io, storage, booking, body);
}

export async function notifyBookingScheduleChangedInChat(
  io: SocketIOServer | null,
  storage: IStorage,
  booking: any,
  updated: any,
  dateFormatted: string,
  dateIso: string,
): Promise<void> {
  const bookingId = Number(booking?.id);
  const serviceId = Number(booking?.serviceId);
  if (!Number.isFinite(bookingId) || !Number.isFinite(serviceId)) return;
  const svc = await storage.getService(serviceId);
  const title = (svc as { title?: string } | undefined)?.title ?? "Servicio";
  const dateLine = formatBookingDateForChat((updated as { date?: unknown }).date);
  const body = [
    `Reserva #${bookingId} — ${title}`,
    `Se actualizó la fecha y hora del servicio: ${dateFormatted}.`,
    `Referencia ISO: ${dateIso}`,
    `Fecha del servicio (calendario): ${dateLine}`,
  ].join("\n");
  await appendServiceBookingSystemChatMessage(io, storage, booking, body);
}
