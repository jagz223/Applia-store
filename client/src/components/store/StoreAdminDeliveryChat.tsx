import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useConversations, useChatRealtime, useMessages, useSendMessage } from "@/hooks/use-chat";
import { ChatWindow } from "@/components/chat/ChatWindow";
import type { StoreOrderPackRideDetail } from "@/hooks/use-store-orders";
import type { ConversationEnriched } from "@/types/chat";

type StoreAdminDeliveryChatProps = {
  packRide: StoreOrderPackRideDetail | null;
  orderId: number;
  chatLocked?: boolean;
};

function buildFallbackConversation(
  packRide: StoreOrderPackRideDetail,
  currentUserId: string,
): ConversationEnriched | null {
  if (!packRide.conversationId || !packRide.driver) return null;
  const driver = packRide.driver;
  return {
    id: packRide.conversationId,
    participant1Id: currentUserId,
    participant2Id: driver.userId,
    kind: "mobility_ride",
    mobilityRideId: packRide.id,
    mobilityRideInProgress: packRide.status === "in_progress",
    mobilityRideCompleted: packRide.status === "cancelled" || packRide.status === "expired",
    lastMessageAt: null,
    createdAt: null,
    otherParticipant: {
      id: driver.userId,
      name: driver.name,
      lastName: driver.lastName ?? "",
      profileImageUrl: driver.profileImageUrl,
    },
    lastMessageText: null,
    unreadCount: 0,
  };
}

export function StoreAdminDeliveryChat({ packRide, orderId, chatLocked = false }: StoreAdminDeliveryChatProps) {
  const { user, isAuthenticated } = useAuth();
  const currentUserId = String(user?.id ?? "");
  const conversationId = packRide?.conversationId ?? null;

  const { data: conversations = [], isLoading: loadingConversations } = useConversations(
    isAuthenticated && conversationId != null,
  );

  const conversation = useMemo(() => {
    if (!conversationId) return null;
    const found = conversations.find((c) => c.id === conversationId);
    if (found) return found;
    if (packRide) return buildFallbackConversation(packRide, currentUserId);
    return null;
  }, [conversationId, conversations, packRide, currentUserId]);

  const [messageInput, setMessageInput] = useState("");
  const messagesQuery = useMessages(conversationId, isAuthenticated && conversationId != null);
  const sendMessage = useSendMessage(conversationId, packRide?.driverUserId ?? undefined);
  useChatRealtime(conversationId);

  if (!packRide) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        Aún no hay un envío Pack Go vinculado a esta orden.
      </p>
    );
  }

  if (packRide.status === "searching") {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        Buscando conductor… El chat se habilitará cuando un conductor acepte el envío.
      </p>
    );
  }

  if (!conversationId || !packRide.driver) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        El chat estará disponible cuando se asigne un conductor.
      </p>
    );
  }

  if (loadingConversations && !conversation) {
    return (
      <div className="py-10 flex justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!conversation) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        No se pudo cargar la conversación del envío.
      </p>
    );
  }

  const locked =
    chatLocked ||
    packRide.status === "cancelled" ||
    packRide.status === "expired" ||
    Boolean(conversation.messagesLocked);

  return (
    <div className="rounded-lg border border-border overflow-hidden h-[min(420px,55vh)] flex flex-col">
      <ChatWindow
        conversation={conversation}
        messages={messagesQuery.messages}
        currentUserId={currentUserId}
        messageInput={messageInput}
        onMessageInputChange={setMessageInput}
        onSendMessage={() => {
          const text = messageInput.trim();
          if (!text || locked) return;
          void sendMessage.mutateAsync(text).then(() => setMessageInput(""));
        }}
        isSending={sendMessage.isPending}
        isLoadingMessages={messagesQuery.isLoading}
        hasMoreMessages={messagesQuery.hasNextPage}
        onLoadMoreMessages={() => void messagesQuery.fetchNextPage()}
        isLoadingMoreMessages={messagesQuery.isFetchingNextPage}
        reminderText={`Orden #${orderId} · Envío Pack Go`}
        chatLocked={locked}
      />
    </div>
  );
}
