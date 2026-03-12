/**
 * Hooks del dominio de chat (Single Responsibility por hook).
 * Dependen de chatApi y de React Query.
 */

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAuth } from "./use-auth";
import { useSocket, useSocketChat } from "./use-socket";
import { chatApi } from "@/lib/chat-api";
import { toDate } from "@/lib/date-utils";
import type { ConversationEnriched, Message } from "@/types/chat";

/** Mensajes por página (alineado con backend). Balance UX / carga servidor. */
export const CHAT_MESSAGES_PAGE_SIZE = 25;

const QUERY_KEYS = {
  conversations: ["chat", "conversations"] as const,
  messages: (conversationId: number) => ["chat", "messages", conversationId] as const,
};

function messageCreatedAtMs(m: Message): number {
  return toDate(m.createdAt as Parameters<typeof toDate>[0]).getTime();
}

/** Ordena conversaciones por último mensaje (más reciente primero), estilo WhatsApp. */
function sortConversationsByLastMessage(conversations: ConversationEnriched[]): ConversationEnriched[] {
  return [...conversations].sort((a, b) => {
    const aTime = a.lastMessageAt ? toDate(a.lastMessageAt as Parameters<typeof toDate>[0]).getTime() : (a.createdAt ? toDate(a.createdAt as Parameters<typeof toDate>[0]).getTime() : 0);
    const bTime = b.lastMessageAt ? toDate(b.lastMessageAt as Parameters<typeof toDate>[0]).getTime() : (b.createdAt ? toDate(b.createdAt as Parameters<typeof toDate>[0]).getTime() : 0);
    return bTime - aTime;
  });
}

export function useConversations(enabled: boolean) {
  return useQuery({
    queryKey: QUERY_KEYS.conversations,
    queryFn: () => chatApi.getConversations(),
    enabled,
    select: sortConversationsByLastMessage,
  });
}

/** Mensajes paginados: lista plana ordenada de más viejo a más nuevo; cargar más con fetchNextPage. */
export function useMessages(conversationId: number | null, enabled: boolean) {
  const infinite = useInfiniteQuery({
    queryKey: QUERY_KEYS.messages(conversationId ?? 0),
    queryFn: ({ pageParam }: { pageParam?: number }) =>
      chatApi.getMessages(conversationId!, {
        limit: CHAT_MESSAGES_PAGE_SIZE,
        before: pageParam,
      }),
    getNextPageParam: (lastPage) => {
      if (!lastPage.hasMore || lastPage.messages.length === 0) return undefined;
      return messageCreatedAtMs(lastPage.messages[0]);
    },
    initialPageParam: undefined as number | undefined,
    enabled: enabled && conversationId != null,
  });

  const messages: Message[] =
    infinite.data?.pages.flatMap((p) => p.messages) ?? [];

  return {
    ...infinite,
    data: messages,
    messages,
    hasNextPage: infinite.hasNextPage,
    fetchNextPage: infinite.fetchNextPage,
    isFetchingNextPage: infinite.isFetchingNextPage,
  };
}

export function useSendMessage(conversationId: number | null, recipientId: string | undefined) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { socket } = useSocket();

  const mutation = useMutation({
    mutationFn: (payload: string | { content: string; type?: "text" | "location" }) => {
      const content = typeof payload === "string" ? payload : payload.content;
      const type = typeof payload === "string" ? "text" : (payload.type ?? "text");
      return chatApi.sendMessage({
        conversationId: conversationId!,
        content,
        type,
      });
    },
    onSuccess: (data, _payload) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.conversations });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.messages(conversationId ?? 0) });
      if (socket && recipientId) {
        socket.emit("message:send", {
          conversationId: String(conversationId),
          recipientId,
          message: {
            content: data.content,
            senderId: user?.id,
            timestamp: new Date(),
          },
        });
      }
    },
  });

  return mutation;
}

export function useMarkConversationAsRead(conversationId: number | null, enabled: boolean) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => chatApi.markConversationAsRead(conversationId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.conversations });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.messages(conversationId ?? 0) });
    },
  });

  return mutation;
}

/** Abre o crea una conversación con un usuario y devuelve su id. */
export function useGetOrCreateConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ participantId, serviceId }: { participantId: string; serviceId?: number }) => {
      const list = await chatApi.getConversations();
      const existing = list.find(
        (c) => c.otherParticipant?.id === participantId || c.participant1Id === participantId || c.participant2Id === participantId
      );
      if (existing) return existing.id;
      const created = await chatApi.createConversation({ participantId, serviceId });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.conversations });
      return created.id;
    },
  });
}

/** Suscribe al socket y mantiene chat en vivo: actualiza mensajes de la conversación abierta y reordena la lista (estilo WhatsApp). */
export function useChatRealtime(conversationId: number | null) {
  useSocketChat(conversationId != null ? String(conversationId) : null);
  const { socket } = useSocket();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!socket) return;
    const handler = (data: { conversationId?: string }) => {
      const notifConvId = data?.conversationId != null ? String(data.conversationId) : null;
      if (notifConvId != null) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.conversations });
      }
      if (conversationId != null && notifConvId === String(conversationId)) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.messages(conversationId) });
        queryClient.refetchQueries({ queryKey: QUERY_KEYS.messages(conversationId) });
      }
    };
    socket.on("notification:message", handler);
    return () => {
      socket.off("notification:message", handler);
    };
  }, [socket, conversationId, queryClient]);
}
