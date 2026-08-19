/**

 * Chat de tienda: pares de sucursales y atención al cliente por pedido.

 */



import type { Server as SocketIOServer } from "socket.io";

import { CHAT_SYSTEM_SENDER_ID } from "@shared/chat-constants";

import {

  STORE_BRANCH_PAIR_CHAT_KIND,

  STORE_ORDER_CUSTOMER_CHAT_KIND,

  isStoreOrderCustomerChatAvailable,

  listStoreBranchPairs,

  normalizeStoreBranchPairIds,

  storeBranchPairTitle,

  userCanAccessStoreBranchPairChat,

  type StoreChatListItem,

  type StoreBranchPair,

} from "@shared/store-chat-schema";

import type { StoreOrder } from "@shared/store-order-schema";

import type { Store } from "@shared/store-schema";

import { defaultStoreBranchName, normalizeStoreBranches, resolveStoreBranch } from "@shared/store-schema";

import { displayUserName } from "@shared/store-staff-schema";

import type { IStorage } from "./storage-applia";

import type { StoreAccessContext } from "./store-product-auth";

import { getIO } from "./socket";



type ConversationRow = {

  id: number;

  kind?: string;

  storeId?: number;

  branchIdA?: string;

  branchIdB?: string;

  branchNameA?: string;

  branchNameB?: string;

  branchId?: string | null;

  branchName?: string | null;

  storeOrderId?: number;

  messagesLocked?: boolean;

  lastMessageAt?: Date | string | null;

};



export async function ensureStoreBranchPairConversation(

  storage: IStorage,

  store: Store,

  branchIdA: string,

  branchIdB: string,

): Promise<{ id: number; created: boolean; pair: StoreBranchPair }> {

  const branches = normalizeStoreBranches(store.branches, store.location ?? null);

  const [idA, idB] = normalizeStoreBranchPairIds(branchIdA, branchIdB);

  const branchA = resolveStoreBranch(branches, idA);

  const branchB = resolveStoreBranch(branches, idB);

  if (!branchA || !branchB) {

    throw new Error("STORE_BRANCH_NOT_FOUND");

  }

  const pair: StoreBranchPair = {

    branchIdA: idA,

    branchIdB: idB,

    branchNameA: branchA.name?.trim() || defaultStoreBranchName(0),

    branchNameB: branchB.name?.trim() || defaultStoreBranchName(1),

  };



  const existing = await storage.findStoreBranchPairConversation(store.id, idA, idB);

  if (existing) {

    await storage.patchConversation(Number((existing as { id: number }).id), {

      branchNameA: pair.branchNameA,

      branchNameB: pair.branchNameB,

    });

    return { id: Number((existing as { id: number }).id), created: false, pair };

  }



  const conv = await storage.createConversation({

    participant1Id: store.ownerUserId,

    participant2Id: store.ownerUserId,

    kind: STORE_BRANCH_PAIR_CHAT_KIND,

    storeId: store.id,

    branchIdA: idA,

    branchIdB: idB,

    branchNameA: pair.branchNameA,

    branchNameB: pair.branchNameB,

    messagesLocked: false,

  });

  const convId = Number((conv as { id: number }).id);

  await storage.createMessage({

    conversationId: convId,

    senderId: CHAT_SYSTEM_SENDER_ID,

    content: `Mensaje del sistema: chat entre ${pair.branchNameA} y ${pair.branchNameB}. Coordinación interna entre sucursales.`,

    type: "system",

    status: "sent",

  });

  return { id: convId, created: true, pair };

}



export async function ensureAllStoreBranchPairConversations(

  storage: IStorage,

  store: Store,

): Promise<number> {

  const branches = normalizeStoreBranches(store.branches, store.location ?? null);

  const pairs = listStoreBranchPairs(branches);

  let created = 0;

  for (const pair of pairs) {

    const result = await ensureStoreBranchPairConversation(

      storage,

      store,

      pair.branchIdA,

      pair.branchIdB,

    );

    if (result.created) created++;

  }

  return created;

}



/** @deprecated Usar ensureStoreBranchPairConversation */

export async function ensureStoreBranchCoordinationConversation(

  storage: IStorage,

  store: Store,

): Promise<{ id: number; created: boolean }> {

  const branches = normalizeStoreBranches(store.branches, store.location ?? null);

  const pairs = listStoreBranchPairs(branches);

  if (pairs.length === 0) {

    throw new Error("STORE_BRANCH_PAIR_REQUIRED");

  }

  const first = pairs[0];

  const { id, created } = await ensureStoreBranchPairConversation(

    storage,

    store,

    first.branchIdA,

    first.branchIdB,

  );

  return { id, created };

}



export async function ensureStoreOrderCustomerConversation(

  storage: IStorage,

  store: Store,

  order: StoreOrder,

  options?: { branchIdOverride?: string | null; allowStaffInitiated?: boolean },

): Promise<{ id: number; created: boolean; chatLocked: boolean }> {

  const staffInitiated = options?.allowStaffInitiated === true;

  if (!staffInitiated && !isStoreOrderCustomerChatAvailable(order)) {

    const existing = await storage.findStoreOrderCustomerConversation(order.id);

    if (existing) {

      return {

        id: Number((existing as { id: number }).id),

        created: false,

        chatLocked: (existing as { messagesLocked?: boolean }).messagesLocked === true,

      };

    }

    throw new Error("STORE_ORDER_CHAT_UNAVAILABLE");

  }



  let conv = await storage.findStoreOrderCustomerConversation(order.id);

  let created = false;

  if (!conv) {

    const branches = normalizeStoreBranches(store.branches, store.location ?? null);

    const overrideBranchId = (options?.branchIdOverride ?? order.branchId ?? "").trim();

    const branch =

      resolveStoreBranch(branches, overrideBranchId) ??

      resolveStoreBranch(branches, order.branchId ?? "") ??

      branches[0] ??

      null;

    const branchId = branch?.id ?? (overrideBranchId || null);

    const branchName = branch?.name?.trim() || (order.branchName ?? "").trim() || defaultStoreBranchName(0);



    conv = await storage.createConversation({

      participant1Id: order.userId,

      participant2Id: store.ownerUserId,

      kind: STORE_ORDER_CUSTOMER_CHAT_KIND,

      storeId: store.id,

      storeOrderId: order.id,

      branchId,

      branchName,

      messagesLocked: false,

    });

    created = true;

    const convId = Number((conv as { id: number }).id);

    await storage.createMessage({

      conversationId: convId,

      senderId: CHAT_SYSTEM_SENDER_ID,

      content: `Mensaje del sistema: chat del pedido #${order.id} con ${branchName}. Puedes escribir dudas sobre tu compra.`,

      type: "system",

      status: "sent",

    });

  }



  const convId = Number((conv as { id: number }).id);

  const branches = normalizeStoreBranches(store.branches, store.location ?? null);

  const overrideBranchId = (options?.branchIdOverride ?? "").trim();

  const branchId = overrideBranchId || (order.branchId ?? "").trim();

  const branchName =
    (overrideBranchId ? resolveStoreBranch(branches, overrideBranchId)?.name : null) ??
    ((order.branchName ?? "").trim() ||
      resolveStoreBranch(branches, branchId)?.name ||
      defaultStoreBranchName(0));

  await storage.patchConversation(convId, {

    branchId: branchId || null,

    branchName,

  });



  const chatLocked =

    !isStoreOrderCustomerChatAvailable(order) ||

    (conv as { messagesLocked?: boolean }).messagesLocked === true;



  return { id: convId, created, chatLocked };

}



export async function appendStoreBranchTransferSystemMessage(input: {

  storage: IStorage;

  store: Store;

  orderId: number;

  actorUserId: string;

  fromBranchId: string | null | undefined;

  fromBranchName: string | null | undefined;

  toBranchId: string;

  toBranchName: string;

}): Promise<void> {

  const { storage, store, orderId, actorUserId, fromBranchId, fromBranchName, toBranchId, toBranchName } =

    input;

  const fromId = (fromBranchId ?? "").trim();

  const toId = (toBranchId ?? "").trim();

  if (!fromId || !toId || fromId === toId) return;



  await ensureAllStoreBranchPairConversations(storage, store);

  const { id: conversationId } = await ensureStoreBranchPairConversation(storage, store, fromId, toId);



  const actor = (await storage.getUserById(actorUserId)) as

    | { name?: string; firstName?: string; lastName?: string; email?: string }

    | undefined;

  const person = displayUserName(actor ?? {}) ?? actor?.email ?? "Un miembro del equipo";

  const fromName = (fromBranchName ?? "").trim() || fromId || "sucursal anterior";

  const toName = (toBranchName ?? "").trim() || toId;

  const content = `Mensaje del sistema: ${person} cambió el pedido #${orderId} de ${fromName} a ${toName}.`;

  const message = await storage.createMessage({

    conversationId,

    senderId: CHAT_SYSTEM_SENDER_ID,

    content,

    type: "system",

    status: "sent",

  });



  const io = getIO() as SocketIOServer | null;

  if (io) {

    await broadcastStoreBranchChatActivity(io, storage, store.id, conversationId, String(message.content ?? ""));

  }

}



async function listStoreBranchChatRecipientUserIds(

  storage: IStorage,

  store: Store,

  branchIdA?: string,

  branchIdB?: string,

): Promise<string[]> {

  const ids = new Set<string>();

  if (store.ownerUserId) ids.add(store.ownerUserId);

  const staff = await storage.listStoreStaffMembers(store.id);

  for (const member of staff) {

    if (member.role !== "employee" || !member.userId) continue;

    if (!branchIdA || !branchIdB) {

      ids.add(member.userId);

      continue;

    }

    const mine = (member.branchId ?? "").trim();

    if (mine === branchIdA.trim() || mine === branchIdB.trim()) {

      ids.add(member.userId);

    }

  }

  return [...ids];

}



export async function broadcastStoreBranchChatActivity(

  io: SocketIOServer,

  storage: IStorage,

  storeId: number,

  conversationId: number,

  preview: string,

): Promise<void> {

  const store = await storage.getStoreById(storeId);

  if (!store) return;

  const conv = (await storage.getConversationById(conversationId)) as ConversationRow | null;

  const recipients = await listStoreBranchChatRecipientUserIds(

    storage,

    store,

    conv?.branchIdA,

    conv?.branchIdB,

  );

  const payload = { conversationId, preview, storeId, kind: STORE_BRANCH_PAIR_CHAT_KIND };

  for (const uid of recipients) {

    io.to(`user:${uid}`).emit("notification:message", payload);

    io.to(`user:${uid}`).emit("store:branch:chat:updated", payload);

    io.to(`user:${uid}`).emit("store:chat:updated", payload);

  }

  io.to(`chat:${conversationId}`).emit("notification:message", payload);

}



export async function broadcastStoreOrderCustomerChatActivity(

  io: SocketIOServer,

  storage: IStorage,

  store: Store,

  order: StoreOrder,

  conversationId: number,

  preview: string,

  senderUserId: string,

): Promise<void> {

  const recipients = new Set<string>();

  recipients.add(order.userId);

  recipients.add(store.ownerUserId);

  const staff = await storage.listStoreStaffMembers(store.id);

  const convRow = (await storage.getConversationById(conversationId)) as { branchId?: string | null } | null;

  const branchId = (convRow?.branchId ?? order.branchId ?? "").trim();

  for (const member of staff) {

    if (member.role === "employee" && member.branchId === branchId) {

      recipients.add(member.userId);

    }

  }

  recipients.delete(senderUserId);

  const payload = {

    conversationId,

    preview,

    storeId: store.id,

    storeOrderId: order.id,

    kind: STORE_ORDER_CUSTOMER_CHAT_KIND,

  };

  for (const uid of recipients) {

    io.to(`user:${uid}`).emit("notification:message", payload);

    io.to(`user:${uid}`).emit("store:order:chat:updated", payload);

    io.to(`user:${uid}`).emit("store:chat:updated", payload);

  }

  io.to(`chat:${conversationId}`).emit("notification:message", payload);

}



export function canAccessStoreBranchChat(access: StoreAccessContext): boolean {

  return access.isOwner || access.isPlatformAdmin || access.isEmployee;

}



export async function canAccessStoreBranchPairConversation(

  access: StoreAccessContext,

  conv: ConversationRow,

): Promise<boolean> {

  if (!canAccessStoreBranchChat(access)) return false;

  const a = String(conv.branchIdA ?? "").trim();

  const b = String(conv.branchIdB ?? "").trim();

  if (!a || !b) return access.isOwner || access.isPlatformAdmin;

  return userCanAccessStoreBranchPairChat(a, b, access);

}



export async function canAccessStoreOrderCustomerChat(

  storage: IStorage,

  userId: string,

  store: Store,

  order: StoreOrder,

  access?: StoreAccessContext | null,

): Promise<boolean> {

  if (order.userId === userId) return isStoreOrderCustomerChatAvailable(order);

  if (access) {

    if (access.isOwner || access.isPlatformAdmin) return true;

    if (access.isEmployee && access.employeeBranchId) {

      const conv = await storage.findStoreOrderCustomerConversation(order.id);

      const branchId = (conv?.branchId ?? order.branchId ?? "").trim();

      return branchId === access.employeeBranchId;

    }

  }

  return false;

}



export async function canAccessStoreConversation(

  storage: IStorage,

  userId: string,

  store: Store,

  conv: ConversationRow,

  access: StoreAccessContext,

): Promise<boolean> {

  const kind = String(conv.kind ?? "");

  if (kind === STORE_BRANCH_PAIR_CHAT_KIND) {

    return canAccessStoreBranchPairConversation(access, conv);

  }

  if (kind === STORE_ORDER_CUSTOMER_CHAT_KIND) {

    const orderId = Number(conv.storeOrderId);

    if (!Number.isFinite(orderId)) return false;

    const order = await storage.getStoreOrder(store.id, orderId);

    if (!order) return false;

    return canAccessStoreOrderCustomerChat(storage, userId, store, order, access);

  }

  return false;

}



function lastMessagePreview(last: { content?: string; type?: string } | null | undefined): string | null {

  if (!last?.content) return null;

  const text = String(last.content);

  if (last.type === "system" || /^Mensaje del sistema:/i.test(text)) {

    return text.replace(/^Mensaje del sistema:\s*/i, "").slice(0, 120);

  }

  return text.slice(0, 120);

}



function toIsoDate(value: Date | string | null | undefined): string | null {

  if (!value) return null;

  const d = value instanceof Date ? value : new Date(value);

  return Number.isNaN(d.getTime()) ? null : d.toISOString();

}



export async function buildStoreChatList(

  storage: IStorage,

  store: Store,

  access: StoreAccessContext,

  userId: string,

): Promise<StoreChatListItem[]> {

  await ensureAllStoreBranchPairConversations(storage, store);



  const items: StoreChatListItem[] = [];

  const pairConvs = await storage.listStoreBranchPairConversations(store.id);

  for (const raw of pairConvs) {

    const conv = raw as ConversationRow;

    if (!(await canAccessStoreBranchPairConversation(access, conv))) continue;

    const last = await storage.getLastMessageByConversation(Number(conv.id));

    const nameA = conv.branchNameA?.trim() || conv.branchIdA || "Sucursal A";

    const nameB = conv.branchNameB?.trim() || conv.branchIdB || "Sucursal B";

    items.push({

      id: Number(conv.id),

      kind: STORE_BRANCH_PAIR_CHAT_KIND,

      title: storeBranchPairTitle(nameA, nameB),

      subtitle: "Entre sucursales",

      lastMessageText: lastMessagePreview(last),

      lastMessageAt: toIsoDate(conv.lastMessageAt ?? last?.createdAt),

      branchIdA: conv.branchIdA ?? null,

      branchIdB: conv.branchIdB ?? null,

      chatLocked: conv.messagesLocked === true,

    });

  }



  const customerConvs = await storage.listStoreOrderCustomerConversations(store.id);

  for (const raw of customerConvs) {

    const conv = raw as ConversationRow;

    const orderId = Number(conv.storeOrderId);

    if (!Number.isFinite(orderId)) continue;

    const order = await storage.getStoreOrder(store.id, orderId);

    if (!order) continue;

    const allowed = await canAccessStoreOrderCustomerChat(storage, userId, store, order, access);

    if (!allowed) continue;

    const customer = (await storage.getUserById(order.userId)) as

      | { name?: string; firstName?: string; lastName?: string; email?: string }

      | undefined;

    const customerName =
      displayUserName(customer ?? {}) ??
      ([customer?.firstName, customer?.lastName].filter(Boolean).join(" ").trim() ||
        customer?.email ||
        null);

    const last = await storage.getLastMessageByConversation(Number(conv.id));

    const branchName = (conv.branchName ?? order.branchName ?? "").trim() || null;

    items.push({

      id: Number(conv.id),

      kind: STORE_ORDER_CUSTOMER_CHAT_KIND,

      title: customerName ? `${customerName}` : `Pedido #${orderId}`,

      subtitle: branchName ? `${branchName} · Pedido #${orderId}` : `Pedido #${orderId}`,

      lastMessageText: lastMessagePreview(last),

      lastMessageAt: toIsoDate(conv.lastMessageAt ?? last?.createdAt),

      branchId: conv.branchId ?? order.branchId ?? null,

      branchName,

      storeOrderId: orderId,

      customerName,

      chatLocked: conv.messagesLocked === true || !isStoreOrderCustomerChatAvailable(order),

    });

  }



  items.sort((a, b) => {

    const ta = a.lastMessageAt ? Date.parse(a.lastMessageAt) : 0;

    const tb = b.lastMessageAt ? Date.parse(b.lastMessageAt) : 0;

    return tb - ta;

  });

  return items;

}



export async function syncStoreOrderCustomerChatLock(

  storage: IStorage,

  order: StoreOrder,

): Promise<void> {

  const conv = await storage.findStoreOrderCustomerConversation(order.id);

  if (!conv) return;

  const convId = Number((conv as { id: number }).id);

  const shouldLock = !isStoreOrderCustomerChatAvailable(order);

  if (shouldLock && (conv as { messagesLocked?: boolean }).messagesLocked !== true) {

    await storage.patchConversation(convId, { messagesLocked: true });

    await storage.createMessage({

      conversationId: convId,

      senderId: CHAT_SYSTEM_SENDER_ID,

      content:

        "Mensaje del sistema: este chat se cerró porque el pedido fue entregado hace más de 24 horas o ya no está activo.",

      type: "system",

      status: "sent",

    });

  }

}


