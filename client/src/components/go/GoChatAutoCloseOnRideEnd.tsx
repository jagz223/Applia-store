import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSocket } from "@/hooks/use-socket";
import { useGoChat } from "@/contexts/GoChatContext";
import { addHiddenConversationId } from "@/lib/hidden-conversations";
import { purgeConversationCache } from "@/hooks/use-chat";

/**
 * Cierra el chat automáticamente cuando un servicio Go termina o se cancela
 * (Car Go o Pack Go), sin importar en qué vista esté el usuario.
 */
export function GoChatAutoCloseOnRideEnd() {
  const { socket } = useSocket();
  const queryClient = useQueryClient();
  const { resetChat, selectedConversationId } = useGoChat();

  useEffect(() => {
    if (!socket) return;
    const close = () => {
      if (selectedConversationId != null) {
        addHiddenConversationId(selectedConversationId);
        purgeConversationCache(queryClient, selectedConversationId);
      }
      resetChat();
    };
    socket.on("cargo:ride:cancelled", close);
    socket.on("cargo:ride:completed", close);
    socket.on("pack:ride:cancelled", close);
    socket.on("pack:ride:completed", close);
    return () => {
      socket.off("cargo:ride:cancelled", close);
      socket.off("cargo:ride:completed", close);
      socket.off("pack:ride:cancelled", close);
      socket.off("pack:ride:completed", close);
    };
  }, [socket, resetChat, selectedConversationId, queryClient]);

  return null;
}

