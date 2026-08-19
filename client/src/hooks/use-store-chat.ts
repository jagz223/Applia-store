import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useSocket } from "@/hooks/use-socket";
import type { Message } from "@/types/chat";
import type { StoreChatListItem } from "@shared/store-chat-schema";

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type StoreChatSession = {
  conversationId: number;
  messages: Message[];
  hasMore: boolean;
  chatLocked: boolean;
  chatAvailable?: boolean;
  whatsappPhone: string | null;
  whatsappDisplay: string | null;
  whatsappUrl: string | null;
  customerName?: string | null;
  branchName?: string | null;
  storeName?: string | null;
};

export function storeChatsListKey(storeId: number) {
  return ["/api/stores", storeId, "chats"] as const;
}

export function storeChatSessionKey(storeId: number, conversationId: number) {
  return ["/api/stores", storeId, "chats", conversationId] as const;
}

/** @deprecated */
export function storeBranchChatKey(storeId: number) {
  return ["/api/stores", storeId, "branch-chat"] as const;
}

export function storeOrderCustomerChatKey(storeId: number, orderId: number) {
  return ["/api/stores", storeId, "orders", orderId, "customer-chat"] as const;
}

export function myStoreOrderChatKey(orderId: number) {
  return ["/api/me/store-orders", orderId, "chat"] as const;
}

export function useStoreChatsList(storeId: number, enabled = true) {
  return useQuery({
    queryKey: storeChatsListKey(storeId),
    queryFn: async (): Promise<StoreChatListItem[]> => {
      const res = await fetch(`/api/stores/${storeId}/chats`, { headers: authHeaders() });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudo cargar los chats");
      }
      const data = (await res.json()) as { chats: StoreChatListItem[] };
      return data.chats ?? [];
    },
    enabled: enabled && storeId > 0,
    refetchInterval: 15_000,
  });
}

export function useStoreChatSession(storeId: number, conversationId: number | null, enabled = true) {
  return useQuery({
    queryKey: storeChatSessionKey(storeId, conversationId ?? 0),
    queryFn: async (): Promise<StoreChatSession> => {
      const res = await fetch(`/api/stores/${storeId}/chats/${conversationId}`, { headers: authHeaders() });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudo cargar el chat");
      }
      return res.json() as Promise<StoreChatSession>;
    },
    enabled: enabled && storeId > 0 && conversationId != null && conversationId > 0,
    refetchInterval: 12_000,
  });
}

export function useSendStoreChatMessage(storeId: number, conversationId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (content: string) => {
      const res = await fetch(`/api/stores/${storeId}/chats/${conversationId}/messages`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ content, type: "text" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudo enviar el mensaje");
      }
      return res.json();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: storeChatSessionKey(storeId, conversationId) });
      void qc.invalidateQueries({ queryKey: storeChatsListKey(storeId) });
    },
  });
}

export function useStartStoreCustomerChat(storeId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { orderId: number; branchId?: string }) => {
      const res = await fetch(`/api/stores/${storeId}/chats/customer/start`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = data as { message?: string; code?: string };
        const error = new Error(err.message ?? "No se pudo iniciar el chat") as Error & { code?: string };
        error.code = err.code;
        throw error;
      }
      return data as {
        conversationId: number;
        created: boolean;
        session: StoreChatSession;
        chats: StoreChatListItem[];
      };
    },
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: storeChatsListKey(storeId) });
      void qc.invalidateQueries({ queryKey: storeChatSessionKey(storeId, data.conversationId) });
    },
  });
}

/** @deprecated */
export function useStoreBranchChat(storeId: number, enabled = true) {
  return useStoreChatsList(storeId, enabled);
}

/** @deprecated */
export function useSendStoreBranchChatMessage(storeId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (_content: string) => {
      throw new Error("Usa useSendStoreChatMessage con el conversationId seleccionado.");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: storeChatsListKey(storeId) });
    },
  });
}

export function useStoreOrderCustomerChatAdmin(storeId: number, orderId: number | null, enabled = true) {
  return useQuery({
    queryKey: storeOrderCustomerChatKey(storeId, orderId ?? 0),
    queryFn: async (): Promise<StoreChatSession> => {
      const res = await fetch(`/api/stores/${storeId}/orders/${orderId}/customer-chat`, {
        headers: authHeaders(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudo cargar el chat");
      }
      return res.json() as Promise<StoreChatSession>;
    },
    enabled: enabled && storeId > 0 && orderId != null && orderId > 0,
    refetchInterval: 12_000,
  });
}

export function useSendStoreOrderCustomerChatAdmin(storeId: number, orderId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (content: string) => {
      const res = await fetch(`/api/stores/${storeId}/orders/${orderId}/customer-chat/messages`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ content, type: "text" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudo enviar el mensaje");
      }
      return res.json();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: storeOrderCustomerChatKey(storeId, orderId) });
      void qc.invalidateQueries({ queryKey: storeChatsListKey(storeId) });
    },
  });
}

export function useMyStoreOrderChat(orderId: number | null, enabled = true) {
  return useQuery({
    queryKey: myStoreOrderChatKey(orderId ?? 0),
    queryFn: async (): Promise<StoreChatSession> => {
      const res = await fetch(`/api/me/store-orders/${orderId}/chat`, { headers: authHeaders() });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudo cargar el chat");
      }
      return res.json() as Promise<StoreChatSession>;
    },
    enabled: enabled && orderId != null && orderId > 0,
    refetchInterval: 12_000,
  });
}

export function useSendMyStoreOrderChat(orderId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (content: string) => {
      const res = await fetch(`/api/me/store-orders/${orderId}/chat/messages`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ content, type: "text" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudo enviar el mensaje");
      }
      return res.json();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: myStoreOrderChatKey(orderId) });
    },
  });
}

export function useStoreChatLiveSync(
  storeId: number,
  conversationId: number | null,
  invalidateKeys: readonly (readonly unknown[])[],
) {
  const qc = useQueryClient();
  const { socket } = useSocket();

  useEffect(() => {
    if (!socket || !storeId) return;
    const handler = (payload: { conversationId?: number; storeId?: number }) => {
      if (payload?.storeId != null && Number(payload.storeId) !== storeId) return;
      if (payload?.conversationId != null && conversationId != null && Number(payload.conversationId) !== conversationId) {
        void qc.invalidateQueries({ queryKey: storeChatsListKey(storeId) });
        return;
      }
      for (const key of invalidateKeys) {
        void qc.invalidateQueries({ queryKey: key });
      }
      void qc.invalidateQueries({ queryKey: storeChatsListKey(storeId) });
    };
    socket.on("notification:message", handler);
    socket.on("store:branch:chat:updated", handler);
    socket.on("store:order:chat:updated", handler);
    socket.on("store:chat:updated", handler);
    return () => {
      socket.off("notification:message", handler);
      socket.off("store:branch:chat:updated", handler);
      socket.off("store:order:chat:updated", handler);
      socket.off("store:chat:updated", handler);
    };
  }, [socket, storeId, conversationId, invalidateKeys, qc]);
}
