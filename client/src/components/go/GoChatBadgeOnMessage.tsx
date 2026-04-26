import { useEffect } from "react";
import { useSocket } from "@/hooks/use-socket";
import { useGoChat } from "@/contexts/GoChatContext";

/**
 * Incrementa el badge del tab Chat (tipo WhatsApp) cuando llega un mensaje
 * y el chat no está abierto en esa conversación.
 */
export function GoChatBadgeOnMessage() {
  const { socket } = useSocket();
  const { isOpen, selectedConversationId, bumpChatBadge } = useGoChat();

  useEffect(() => {
    if (!socket) return;
    const handler = (data: { conversationId?: string }) => {
      const notifConvId = data?.conversationId != null ? Number(data.conversationId) : null;
      // Si el chat está abierto y ya estamos viendo esa conversación, no incrementar.
      if (isOpen && notifConvId != null && selectedConversationId != null && notifConvId === selectedConversationId) return;
      // Si el chat está abierto (aunque sea otra conversación), no incrementamos para evitar ruido.
      if (isOpen) return;
      bumpChatBadge(1);
    };
    socket.on("notification:message", handler);
    return () => {
      socket.off("notification:message", handler);
    };
  }, [socket, isOpen, selectedConversationId, bumpChatBadge]);

  return null;
}

