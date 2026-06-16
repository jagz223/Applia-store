import type { Server as SocketIOServer } from "socket.io";
import { CHAT_SYSTEM_SENDER_ID } from "@shared/chat-constants";
import { SUPPORT_CONVERSATION_KIND, formatSupportConsultationLabel } from "@shared/support-chat";
import { isFullAdmin, normalizeRoleCode } from "@shared/roles";
import type { IStorage } from "./storage-genfeb";
import { getAdminAndSupportUsers } from "./staff-users";
import { connectedUsers, getIO } from "./socket";

function staffRank(user: { role?: string }): number {
  return isFullAdmin(user.role) ? 2 : normalizeRoleCode(user.role) === "tiSupport" ? 1 : 0;
}

/** Admin de mayor rango; si hay varios conectados por socket, prioriza entre el tier más alto. */
export async function pickSupportStaffUser(
  storage: IStorage,
  excludeUserId?: string,
): Promise<{ id: string; name?: string } | null> {
  const exclude = String(excludeUserId ?? "").trim();
  const staff = (await getAdminAndSupportUsers(storage)).filter(
    (u) => String((u as { id?: string }).id ?? "").trim() !== exclude,
  );
  if (!staff.length) return null;

  const ranked = [...staff].sort((a, b) => {
    const dr = staffRank(b) - staffRank(a);
    if (dr !== 0) return dr;
    const nameA = String((a as { name?: string }).name ?? "");
    const nameB = String((b as { name?: string }).name ?? "");
    return nameA.localeCompare(nameB, "es");
  });

  const topRank = staffRank(ranked[0]);
  const tier = ranked.filter((u) => staffRank(u) === topRank);
  const online = tier.filter((u) => connectedUsers.has(String((u as { id?: string }).id ?? "")));
  const pick = (online.length > 0 ? online : tier)[0];
  const id = String((pick as { id?: string }).id ?? "").trim();
  if (!id) return null;
  return { id, name: (pick as { name?: string }).name };
}

async function appendSupportSystemMessage(
  storage: IStorage,
  conversationId: number,
  content: string,
): Promise<any> {
  return storage.createMessage({
    conversationId,
    senderId: CHAT_SYSTEM_SENDER_ID,
    content,
    type: "system",
    status: "sent",
  });
}

function broadcastSupportConversationChange(
  io: SocketIOServer,
  conv: { participant1Id?: string; participant2Id?: string },
  conversationId: number,
  messagesLocked: boolean,
  systemMessage?: { id?: number; content?: string },
): void {
  const payload = {
    conversationId,
    messagesLocked,
    kind: SUPPORT_CONVERSATION_KIND,
  };
  const p1 = String(conv.participant1Id ?? "");
  const p2 = String(conv.participant2Id ?? "");
  const preview = String(systemMessage?.content ?? "").slice(0, 120);

  for (const uid of [p1, p2]) {
    if (!uid) continue;
    io.to(`user:${uid}`).emit("conversation:updated", payload);
    if (systemMessage) {
      io.to(`user:${uid}`).emit("notification:message", {
        conversationId,
        preview,
        messageId: systemMessage.id,
      });
    }
  }
  io.to(`chat:${conversationId}`).emit("conversation:updated", payload);
  if (systemMessage) {
    io.to(`chat:${conversationId}`).emit("notification:message", {
      conversationId,
      preview,
      messageId: systemMessage.id,
    });
  }
}

/**
 * Abre chat de ayuda: reutiliza solo si hay una consulta activa (no cerrada).
 * Si la anterior está cerrada, crea un hilo nuevo con número de consulta secuencial.
 */
export async function ensureSupportConversation(
  storage: IStorage,
  clientUserId: string,
): Promise<{ conversationId: number; adminId: string; created: boolean; consultationNumber: number }> {
  const staff = await pickSupportStaffUser(storage, clientUserId);
  if (!staff) throw new Error("SUPPORT_STAFF_UNAVAILABLE");

  const staffUserId = staff.id;
  const active = await storage.findActiveSupportConversation(clientUserId, staffUserId);
  if (active) {
    const convId = Number((active as { id: number }).id);
    const consultationNumber = Number((active as { supportConsultationNumber?: number }).supportConsultationNumber);
    return {
      conversationId: convId,
      adminId: staffUserId,
      created: false,
      consultationNumber: Number.isFinite(consultationNumber) && consultationNumber > 0 ? consultationNumber : 0,
    };
  }

  const consultationNumber = await storage.allocateSupportConsultationNumber();
  const conv = await storage.createConversation({
    participant1Id: clientUserId,
    participant2Id: staffUserId,
    kind: SUPPORT_CONVERSATION_KIND,
    supportClientUserId: clientUserId,
    supportConsultationNumber: consultationNumber,
    messagesLocked: false,
  });
  const convId = Number((conv as { id: number }).id);
  await appendSupportSystemMessage(
    storage,
    convId,
    `Mensaje del sistema: ${formatSupportConsultationLabel(consultationNumber) ?? "Consulta de ayuda"} abierta. Un asesor de GenFeb te atenderá por aquí.`,
  );
  return { conversationId: convId, adminId: staffUserId, created: true, consultationNumber };
}

export async function closeSupportConversation(
  storage: IStorage,
  conversationId: number,
  closedByUserId: string,
): Promise<void> {
  const convs = await storage.getConversationsByUser(closedByUserId);
  const conv = convs.find((c: any) => Number(c.id) === conversationId);
  if (!conv) throw new Error("CONVERSATION_NOT_FOUND");
  if (String((conv as { kind?: string }).kind ?? "") !== SUPPORT_CONVERSATION_KIND) {
    throw new Error("NOT_SUPPORT_CONVERSATION");
  }
  if ((conv as { messagesLocked?: boolean }).messagesLocked === true) return;

  const consultationNumber = Number((conv as { supportConsultationNumber?: number }).supportConsultationNumber);
  const label = formatSupportConsultationLabel(consultationNumber) ?? "Consulta de ayuda";

  await storage.patchConversation(conversationId, {
    messagesLocked: true,
    supportConsultationClosedAt: new Date().toISOString(),
  });
  const systemMessage = await appendSupportSystemMessage(
    storage,
    conversationId,
    `Mensaje del sistema: el asesor cerró ${label}. El historial queda guardado. Para una nueva consulta, abre el chat de ayuda otra vez.`,
  );

  const io = getIO() as SocketIOServer | null;
  if (io) {
    broadcastSupportConversationChange(io, conv as { participant1Id?: string; participant2Id?: string }, conversationId, true, systemMessage);
  }
}
