import { createContext, useCallback, useContext, useMemo, useState } from "react";

type GoChatState = {
  isOpen: boolean;
  selectedConversationId: number | null;
  chatBadge: number;
  openChat: () => void;
  /** Abre el drawer de chat y selecciona una conversación (p. ej. tras emparejar Car Go). */
  openChatWithConversation: (conversationId: number) => void;
  /**
   * Car Go: asocia la conversación y muestra badge (+1) sin abrir el drawer
   * (la pantalla del mapa / conductor debe quedar al frente).
   */
  primeCarGoConversation: (conversationId: number) => void;
  closeChat: () => void;
  /** Cierra el chat y limpia la conversación seleccionada (p. ej. al cancelar/terminar un viaje). */
  resetChat: () => void;
  setSelectedConversationId: (id: number | null) => void;
};

const Ctx = createContext<GoChatState | null>(null);

export function GoChatProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [chatBadge, setChatBadge] = useState(0);

  const openChat = useCallback(() => {
    setIsOpen(true);
    setChatBadge(0);
  }, []);
  const openChatWithConversation = useCallback((conversationId: number) => {
    setSelectedConversationId(conversationId);
    setIsOpen(true);
    // Al abrir el chat, el badge debe limpiarse.
    setChatBadge(0);
  }, []);
  const primeCarGoConversation = useCallback((conversationId: number) => {
    setSelectedConversationId(conversationId);
    setIsOpen(false);
    // Solo asociar conversación; el badge debe depender de mensajes reales.
    setChatBadge(0);
  }, []);
  const closeChat = useCallback(() => setIsOpen(false), []);
  const resetChat = useCallback(() => {
    setIsOpen(false);
    setSelectedConversationId(null);
    setChatBadge(0);
  }, []);

  const value = useMemo<GoChatState>(
    () => ({
      isOpen,
      selectedConversationId,
      chatBadge,
      openChat,
      openChatWithConversation,
      primeCarGoConversation,
      closeChat,
      resetChat,
      setSelectedConversationId,
    }),
    [isOpen, selectedConversationId, chatBadge, openChat, openChatWithConversation, primeCarGoConversation, closeChat, resetChat]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGoChat(): GoChatState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useGoChat debe usarse dentro de GoChatProvider");
  return ctx;
}

