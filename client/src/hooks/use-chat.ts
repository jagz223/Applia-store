/**
 * Hooks del dominio de chat (Single Responsibility por hook).
 * Dependen de chatApi y de React Query.
 */

import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAuth } from "./use-auth";
import { findConversationForServiceScope } from "@shared/chat-conversation-scope";
import { useSocket, useSocketChat } from "./use-socket";
import { chatApi } from "@/lib/chat-api";
import { toDate } from "@/lib/date-utils";
import { debouncedRefetch } from "@/lib/refetch-utils";
import { loadHiddenConversationIds } from "@/lib/hidden-conversations";
import type { ConversationEnriched, Message } from "@/types/chat";

/** Mensajes por página (alineado con backend). Balance UX / carga servidor. */
export const CHAT_MESSAGES_PAGE_SIZE = 25;

export const QUERY_KEYS = {
  conversations: ["chat", "conversations"] as const,
  messages: (conversationId: number) => ["chat", "messages", conversationId] as const,
};

export function purgeConversationCache(queryClient: QueryClient, conversationId: number) {
  const id = Number(conversationId);
  if (!Number.isFinite(id) || id <= 0) return;

  // 1) Remover cache de mensajes (infinite query)
  queryClient.removeQueries({ queryKey: QUERY_KEYS.messages(id) });

  // 2) Actualizar lista de conversaciones inmediatamente (si está en cache)
  queryClient.setQueryData<ConversationEnriched[] | undefined>(QUERY_KEYS.conversations, (prev) => {
    if (!prev) return prev;
    return prev.filter((c) => c.id !== id);
  });
}

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
    select: (list) => {
      const hidden = new Set(loadHiddenConversationIds());
      const filtered = hidden.size ? list.filter((c) => !hidden.has(c.id)) : list;
      return sortConversationsByLastMessage(filtered);
    },
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

export function useSendMessage(conversationId: number | null, _recipientId?: string) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (
      payload: string | { content: string; type?: "text" | "image" | "file" | "location" | "system" },
    ) => {
      const content = typeof payload === "string" ? payload : payload.content;
      const type = typeof payload === "string" ? "text" : (payload.type ?? "text");
      return chatApi.sendMessage({
        conversationId: conversationId!,
        content,
        type,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.conversations });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.messages(conversationId ?? 0) });
      // Refetch inmediato para que el mensaje aparezca al instante (sin debounce)
      void queryClient.refetchQueries({ queryKey: QUERY_KEYS.conversations });
      void queryClient.refetchQueries({ queryKey: QUERY_KEYS.messages(conversationId ?? 0) });
      // No emitir message:send por socket: el backend ya notifica al destinatario al crear el mensaje (POST /api/messages).
      // Emitir aquí duplicaba la notificación en la campanita del receptor.
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
      void queryClient.refetchQueries({ queryKey: QUERY_KEYS.conversations });
      void queryClient.refetchQueries({ queryKey: QUERY_KEYS.messages(conversationId ?? 0) });
    },
  });

  return mutation;
}

/** Abre o crea una conversación con un usuario y devuelve su id. */
export function useGetOrCreateConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      participantId,
      serviceId,
      bookingId,
      mobilityRideId,
    }: {
      participantId: string;
      serviceId?: number;
      /** Solo reutiliza el hilo de esa reserva (Pro Go / Man Go). */
      bookingId?: number;
      /** Solo reutiliza el hilo de ese viaje (Car Go / Delivery). */
      mobilityRideId?: string;
    }) => {
      const list = await chatApi.getConversations();
      const hasRideScope = mobilityRideId != null && String(mobilityRideId).trim() !== "";
      const hasBookingScope = bookingId != null && Number.isFinite(bookingId);

      const existing = findConversationForServiceScope(list, {
        participantId,
        bookingId,
        mobilityRideId,
      });
      if (existing) return existing.id;

      // Car Go / Delivery: el hilo lo crea el servidor al emparejar; no abrir chat genérico con el mismo usuario.
      if (hasRideScope) {
        throw new Error("El chat del viaje aún no está disponible. Espera a que se confirme el servicio.");
      }

      const created = await chatApi.createConversation({ participantId, serviceId, bookingId });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.conversations });
      debouncedRefetch(queryClient, QUERY_KEYS.conversations);
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
        debouncedRefetch(queryClient, QUERY_KEYS.conversations);
      }
      if (conversationId != null && notifConvId === String(conversationId)) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.messages(conversationId) });
        debouncedRefetch(queryClient, QUERY_KEYS.messages(conversationId));
      }
    };
    socket.on("notification:message", handler);
    return () => {
      socket.off("notification:message", handler);
    };
  }, [socket, conversationId, queryClient]);
}
