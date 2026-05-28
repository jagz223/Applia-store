import { useEffect } from "react";
import { useLocation } from "wouter";
import { useGoChat } from "@/contexts/GoChatContext";
import {
  GO_OPEN_CHAT_EVENT,
  parseGoChatConversationId,
  stripGoChatQueryParam,
} from "@/lib/open-go-chat";

/** Abre el drawer de chat: `?goChat=` en URL, o evento in-app desde notificaciones. */
export function GoChatOpenFromQuery() {
  const [location] = useLocation();
  const { openChatWithConversation } = useGoChat();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const convId = parseGoChatConversationId(window.location.search);
    if (convId == null) return;
    openChatWithConversation(convId);
    stripGoChatQueryParam();
  }, [location, openChatWithConversation]);

  useEffect(() => {
    const onOpen = (ev: Event) => {
      const id = Number((ev as CustomEvent<{ conversationId?: number }>).detail?.conversationId);
      if (!Number.isFinite(id) || id <= 0) return;
      openChatWithConversation(id);
    };
    window.addEventListener(GO_OPEN_CHAT_EVENT, onOpen);
    return () => window.removeEventListener(GO_OPEN_CHAT_EVENT, onOpen);
  }, [openChatWithConversation]);

  return null;
}
