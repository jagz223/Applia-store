/**
 * Hooks del dominio de chat (Single Responsibility por hook).
 * Dependen de chatApi y de React Query.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAuth } from "./use-auth";
import { useSocket, useSocketChat } from "./use-socket";
import { chatApi } from "@/lib/chat-api";
import type { ConversationEnriched, Message } from "@/types/chat";

const QUERY_KEYS = {
  conversations: ["chat", "conversations"] as const,
  messages: (conversationId: number) => ["chat", "messages", conversationId] as const,
};

export function useConversations(enabled: boolean) {
  return useQuery({
    queryKey: QUERY_KEYS.conversations,
    queryFn: () => chatApi.getConversations(),
    enabled,
  });
}

export function useMessages(conversationId: number | null, enabled: boolean) {
  return useQuery({
    queryKey: QUERY_KEYS.messages(conversationId ?? 0),
    queryFn: () => chatApi.getMessages(conversationId!),
    enabled: enabled && conversationId != null,
  });
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

/** Suscribe al socket de la conversación y refresca mensajes al recibir notificación. */
export function useChatRealtime(conversationId: number | null, refetchMessages: () => void) {
  useSocketChat(conversationId != null ? String(conversationId) : null);
  const { socket } = useSocket();

  useEffect(() => {
    if (!socket || conversationId == null) return;
    const handler = (data: { conversationId?: string }) => {
      if (String(data?.conversationId) === String(conversationId)) refetchMessages();
    };
    socket.on("notification:message", handler);
    return () => {
      socket.off("notification:message", handler);
    };
  }, [socket, conversationId, refetchMessages]);
}
