import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
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
import { MessageSquare, Info } from "lucide-react";
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
  const resolvedSupportRef = useRef<boolean>(false);
  /** Contexto de la conversación al abrir desde reserva/servicio (para mostrar recordatorio). */
  const [chatContext, setChatContext] = useState<{ bookingId: number | null; serviceId: number | null }>({ bookingId: null, serviceId: null });

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

  const bookingIdForContext = chatContext.bookingId && selectedConversationId ? chatContext.bookingId : null;
  const serviceIdForContext = chatContext.serviceId && selectedConversationId && !chatContext.bookingId ? chatContext.serviceId : null;
  const { data: bookingContext } = useQuery({
    queryKey: ["booking", bookingIdForContext],
    queryFn: async () => {
      const res = await fetch(`/api/bookings/${bookingIdForContext}`);
      if (!res.ok) throw new Error("Reserva no encontrada");
      return res.json() as Promise<{ id: number; serviceTitle?: string; status?: string }>;
    },
    enabled: !!bookingIdForContext,
  });
  const { data: serviceContext } = useQuery({
    queryKey: ["service", serviceIdForContext],
    queryFn: async () => {
      const res = await fetch(`/api/services/${serviceIdForContext}`);
      if (!res.ok) throw new Error("Servicio no encontrado");
      return res.json() as Promise<{ id: number; title?: string }>;
    },
    enabled: !!serviceIdForContext,
  });

  const chatReminderText =
    selectedConversationId &&
    (bookingContext?.status === "pending" ||
      bookingContext?.status === "confirmed" ||
      bookingContext?.status === "in_progress"
      ? bookingContext?.serviceTitle != null
        ? `Este chat es sobre la reserva #${bookingContext.id} — ${bookingContext.serviceTitle}. Ambos pueden ver este recordatorio.`
        : `Este chat es sobre la reserva #${bookingContext.id}. Ambos pueden ver este recordatorio.`
      : serviceContext?.title
        ? `Este chat es sobre el servicio: ${serviceContext.title}. Ambos pueden ver este recordatorio.`
        : null);

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

  // Resolver ?with=, ?bookingId= y ?serviceId= al cargar (guardar contexto para recordatorio)
  useEffect(() => {
    if (!isAuthenticated || !conversationsQuery.isSuccess) return;
    const params = new URLSearchParams(window.location.search);
    const withUserId = params.get("with");
    const bookingIdParam = params.get("bookingId");
    const serviceIdParam = params.get("serviceId");
    const bookingId = bookingIdParam ? parseInt(bookingIdParam, 10) : null;
    const serviceId = serviceIdParam ? parseInt(serviceIdParam, 10) : null;
    if (bookingId != null && !Number.isNaN(bookingId)) setChatContext((prev) => ({ ...prev, bookingId }));
    if (serviceId != null && !Number.isNaN(serviceId)) setChatContext((prev) => ({ ...prev, serviceId }));
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

  // Resolver Centro de Ayuda: ?support=1 abre conversación con el administrador.
  useEffect(() => {
    if (!isAuthenticated || !conversationsQuery.isSuccess) return;
    const params = new URLSearchParams(window.location.search);
    const supportFlag = params.get("support");
    if (supportFlag !== "1") return;
    if (resolvedSupportRef.current) return;
    resolvedSupportRef.current = true;

    const openSupportAdminChat = async (adminId: string) => {
      const existing = conversations.find(
        (c) => c.otherParticipant?.id === adminId || c.participant1Id === adminId || c.participant2Id === adminId,
      );
      if (existing) {
        setSelectedConversationId(existing.id);
        setLocation("/chat", { replace: true });
        return;
      }
      getOrCreateConversation.mutate(
        { participantId: adminId },
        {
          onSuccess: (conversationId) => {
            setSelectedConversationId(conversationId);
            setLocation("/chat", { replace: true });
          },
        },
      );
    };

    const run = async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch("/api/support/admin", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as { message?: string }).message ?? "No se pudo cargar el administrador");
        }
        const data = (await res.json()) as { adminId?: string };
        if (!data.adminId) throw new Error("Administrador no disponible");
        await openSupportAdminChat(data.adminId);
      } catch (e) {
        toast({
          variant: "destructive",
          title: "Error",
          description: e instanceof Error ? e.message : "No se pudo abrir el chat",
        });
      }
    };

    void run();
  }, [isAuthenticated, conversationsQuery.isSuccess, conversations, getOrCreateConversation, setLocation, toast]);

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
                  Chatea directamente con clientes y asociados
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
                        reminderText={chatReminderText ?? undefined}
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
                    Chatea directamente con clientes y asociados
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
                      reminderText={chatReminderText ?? undefined}
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
