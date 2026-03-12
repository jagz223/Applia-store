import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import {
  useConversations,
  useMessages,
  useSendMessage,
  useMarkConversationAsRead,
  useGetOrCreateConversation,
  useChatRealtime,
} from "@/hooks/use-chat";
import {
  ConversationList,
  ChatWindow,
  ChatEmptyState,
  ChatUnauthenticated,
} from "@/components/chat";
import { Card } from "@/components/ui/card";
import { MessageSquare } from "lucide-react";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSocket } from "@/hooks/use-socket";

/** Altura del área de chat (viewport menos header aproximado). */
const CHAT_AREA_HEIGHT = "calc(100vh - 280px)";
const CHAT_AREA_MIN_HEIGHT = 500;

export default function Chat() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { setOpenChatConversationId } = useSocket();

  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileShowList, setMobileShowList] = useState(true);
  const isMobile = useIsMobile();
  const resolvedWithRef = useRef<string | null>(null);

  const conversationsQuery = useConversations(!!isAuthenticated);
  const conversations = conversationsQuery.data ?? [];
  const messagesQuery = useMessages(selectedConversationId, !!isAuthenticated && selectedConversationId != null);
  const messages = messagesQuery.messages ?? messagesQuery.data ?? [];
  const selectedConversation = conversations.find((c) => c.id === selectedConversationId);
  const recipientId =
    selectedConversation?.otherParticipant?.id ??
    (selectedConversation && user?.id
      ? selectedConversation.participant1Id === user.id
        ? selectedConversation.participant2Id
        : selectedConversation.participant1Id
      : undefined);
  const sendMessage = useSendMessage(selectedConversationId, recipientId);
  const markAsRead = useMarkConversationAsRead(selectedConversationId, !!selectedConversationId);
  const getOrCreateConversation = useGetOrCreateConversation();

  useChatRealtime(selectedConversationId);

  // Indicar conversación abierta para no mostrar notificación en la campana ni badge en la lista
  useEffect(() => {
    setOpenChatConversationId(selectedConversationId != null ? String(selectedConversationId) : null);
    return () => setOpenChatConversationId(null);
  }, [selectedConversationId, setOpenChatConversationId]);

  // Marcar como leído al abrir una conversación
  useEffect(() => {
    if (selectedConversationId != null) {
      markAsRead.mutate(undefined, { onError: () => {} });
    }
  }, [selectedConversationId]);

  // Abrir conversación por ?conversation=id (ej. desde notificación)
  useEffect(() => {
    if (!conversationsQuery.isSuccess || conversations.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const conversationIdParam = params.get("conversation");
    if (conversationIdParam == null) return;
    const id = Number(conversationIdParam);
    if (Number.isNaN(id)) return;
    const exists = conversations.some((c) => c.id === id);
    if (exists && selectedConversationId !== id) {
      setSelectedConversationId(id);
      setLocation("/chat", { replace: true });
    }
  }, [conversationsQuery.isSuccess, conversations, selectedConversationId, setLocation]);

  // Resolver ?with= y ?serviceId= al cargar (una sola vez por with)
  useEffect(() => {
    if (!isAuthenticated || !conversationsQuery.isSuccess) return;
    const params = new URLSearchParams(window.location.search);
    const withUserId = params.get("with");
    const serviceIdParam = params.get("serviceId");
    const serviceId = serviceIdParam ? parseInt(serviceIdParam, 10) : undefined;
    if (!withUserId) {
      resolvedWithRef.current = null;
      return;
    }
    if (resolvedWithRef.current === withUserId) return;
    resolvedWithRef.current = withUserId;

    const existing = conversations.find(
      (c) =>
        c.otherParticipant?.id === withUserId ||
        c.participant1Id === withUserId ||
        c.participant2Id === withUserId
    );
    if (existing) {
      setSelectedConversationId(existing.id);
      setLocation("/chat", { replace: true });
      return;
    }
    getOrCreateConversation.mutate(
      { participantId: withUserId, serviceId },
      {
        onSuccess: (conversationId) => {
          setSelectedConversationId(conversationId);
          setLocation("/chat", { replace: true });
        },
        onError: (err) => {
          resolvedWithRef.current = null;
          toast({
            variant: "destructive",
            title: "Error",
            description: err instanceof Error ? err.message : "No se pudo abrir la conversación",
          });
        },
      }
    );
  }, [isAuthenticated, conversationsQuery.isSuccess, conversations]);

  const handleSelectConversationMobile = (id: number | null) => {
    setSelectedConversationId(id);
    setMobileShowList(false);
  };

  const handleBackToMobileList = () => {
    setMobileShowList(true);
  };

  const handleSendMessage = () => {
    const text = messageInput.trim();
    if (!text || sendMessage.isPending) return;
    sendMessage.mutate({ content: text, type: "text" }, {
      onSuccess: () => setMessageInput(""),
      onError: (err) => {
        toast({
          variant: "destructive",
          title: "Error al enviar",
          description: err instanceof Error ? err.message : "No se pudo enviar el mensaje",
        });
      },
    });
  };

  const handleShareLocation = () => {
    if (sendMessage.isPending) return;
    if (!navigator.geolocation) {
      toast({
        variant: "destructive",
        title: "No disponible",
        description: "Tu navegador no soporta geolocalización",
      });
      return;
    }
    toast({ title: "Obteniendo ubicación...", description: "Permite el acceso si el navegador lo pide." });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const content = JSON.stringify({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        sendMessage.mutate({ content, type: "location" }, {
          onError: (err) => {
            toast({
              variant: "destructive",
              title: "Error al enviar",
              description: err instanceof Error ? err.message : "No se pudo enviar la ubicación",
            });
          },
        });
      },
      () => {
        toast({
          variant: "destructive",
          title: "Ubicación no disponible",
          description: "No se pudo obtener tu ubicación. Revisa los permisos del navegador.",
        });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Cargando...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <ChatUnauthenticated />;
  }

  return (
    <div className="min-h-screen bg-background">
      {isMobile ? (
        /* ========== VISTA MÓVIL (estilo Telegram/WhatsApp) ========== */
        <>
        <section className="bg-gradient-to-r from-primary/20 via-background to-accent/20 border-b border-border">
          <div className="container px-4 py-6 mx-auto max-w-7xl">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/20">
                <MessageSquare className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-display font-bold">
                  Mensajes <span className="text-gradient-primary">en Vivo</span>
                </h1>
                <p className="text-muted-foreground text-sm">
                  Chatea directamente con clientes y profesionales
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="py-4 pb-16 px-4">
          <div className="container mx-auto max-w-7xl">
            <Card className="card-industrial overflow-hidden">
              <div
                className="relative overflow-hidden"
                style={{ height: CHAT_AREA_HEIGHT, minHeight: CHAT_AREA_MIN_HEIGHT }}
              >
                <motion.div
                  className="absolute inset-0 flex"
                  initial={false}
                  animate={{ x: mobileShowList ? "0%" : "-100%" }}
                  transition={{ type: "tween", duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
                >
                  <div className="w-full min-w-full min-h-0 flex flex-col shrink-0">
                    <ConversationList
                      conversations={conversations}
                      searchQuery={searchQuery}
                      onSearchChange={setSearchQuery}
                      selectedId={selectedConversationId}
                      onSelectConversation={handleSelectConversationMobile}
                      isLoading={conversationsQuery.isLoading}
                      isError={conversationsQuery.isError}
                      error={conversationsQuery.error as Error | undefined}
                      onRetry={() => conversationsQuery.refetch()}
                    />
                  </div>
                  <div className="w-full min-w-full min-h-0 flex flex-col shrink-0">
                    {selectedConversation && user ? (
                      <ChatWindow
                        conversation={selectedConversation}
                        messages={messages}
                        currentUserId={user.id}
                        messageInput={messageInput}
                        onMessageInputChange={setMessageInput}
                        onSendMessage={handleSendMessage}
                        onShareLocation={handleShareLocation}
                        isSending={sendMessage.isPending}
                        isLoadingMessages={messagesQuery.isLoading}
                        hasMoreMessages={messagesQuery.hasNextPage ?? false}
                        onLoadMoreMessages={messagesQuery.fetchNextPage}
                        isLoadingMoreMessages={messagesQuery.isFetchingNextPage ?? false}
                        onBack={handleBackToMobileList}
                      />
                    ) : (
                      <ChatEmptyState />
                    )}
                  </div>
                </motion.div>
              </div>
            </Card>
          </div>
        </section>
        </>
      ) : (
        /* ========== VISTA ESCRITORIO: lista + ventana de mensajes ========== */
        <>
        <section className="bg-gradient-to-r from-primary/20 via-background to-accent/20 border-b border-border">
          <div className="container px-4 py-6 mx-auto max-w-7xl">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/20">
                  <MessageSquare className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h1 className="text-2xl font-display font-bold">
                    Mensajes <span className="text-gradient-primary">en Vivo</span>
                  </h1>
                  <p className="text-muted-foreground text-sm">
                    Chatea directamente con clientes y profesionales
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        <section className="py-6 pb-16 min-w-0">
          <div className="container px-4 mx-auto max-w-7xl w-full min-w-0">
            <Card className="card-industrial overflow-hidden w-full min-w-0">
              <div
                className="grid w-full min-h-0"
                style={{
                  display: "grid",
                  gridTemplateColumns: "320px 1fr",
                  height: CHAT_AREA_HEIGHT,
                  minHeight: CHAT_AREA_MIN_HEIGHT,
                }}
              >
                <div className="min-h-0 overflow-hidden flex flex-col" style={{ width: 320, minWidth: 320, maxWidth: 320 }}>
                  <ConversationList
                    conversations={conversations}
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    selectedId={selectedConversationId}
                    onSelectConversation={setSelectedConversationId}
                    isLoading={conversationsQuery.isLoading}
                    isError={conversationsQuery.isError}
                    error={conversationsQuery.error as Error | undefined}
                    onRetry={() => conversationsQuery.refetch()}
                  />
                </div>
                <div className="min-h-0 min-w-0 overflow-hidden flex flex-col">
                  {selectedConversation && user ? (
                    <ChatWindow
                      conversation={selectedConversation}
                      messages={messages}
                      currentUserId={user.id}
                      messageInput={messageInput}
                      onMessageInputChange={setMessageInput}
                      onSendMessage={handleSendMessage}
                      onShareLocation={handleShareLocation}
                      isSending={sendMessage.isPending}
                      isLoadingMessages={messagesQuery.isLoading}
                      hasMoreMessages={messagesQuery.hasNextPage ?? false}
                      onLoadMoreMessages={messagesQuery.fetchNextPage}
                      isLoadingMoreMessages={messagesQuery.isFetchingNextPage ?? false}
                      onBack={() => setSelectedConversationId(null)}
                    />
                  ) : (
                    <ChatEmptyState />
                  )}
                </div>
              </div>
            </Card>
          </div>
        </section>
        </>
      )}
    </div>
  );
}
