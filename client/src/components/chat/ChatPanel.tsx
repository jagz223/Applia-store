import { useState, useEffect, useRef, useMemo } from "react";
import { Link, useLocation } from "wouter";
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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SingleLocationPicker, type PickedLocation } from "@/components/taxi/SingleLocationPicker";
import { ArrowLeft, MessageSquare } from "lucide-react";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSocket } from "@/hooks/use-socket";

type Props = {
  mode: "page" | "embedded";
  selectedConversationId?: number | null;
  onSelectedConversationIdChange?: (id: number | null) => void;
};

/** Altura del área de chat (viewport menos header aproximado). */
const CHAT_AREA_HEIGHT = "calc(100vh - 280px)";
const CHAT_AREA_MIN_HEIGHT = 500;

export function ChatPanel({ mode, selectedConversationId: externalId, onSelectedConversationIdChange }: Props) {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const allowNavigate = mode === "page";
  const [pathname, setLocation] = useLocation();
  const fromGo = useMemo(() => {
    if (!allowNavigate) return false;
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("from") === "go";
  }, [allowNavigate, pathname]);
  const { toast } = useToast();
  const { setOpenChatConversationId } = useSocket();

  const [internalSelectedConversationId, setInternalSelectedConversationId] = useState<number | null>(null);
  const selectedConversationId = externalId ?? internalSelectedConversationId;
  const setSelectedConversationId = useMemo(() => {
    return onSelectedConversationIdChange ?? setInternalSelectedConversationId;
  }, [onSelectedConversationIdChange]);

  const [messageInput, setMessageInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileShowList, setMobileShowList] = useState(true);
  const isMobile = useIsMobile();
  const resolvedWithRef = useRef<string | null>(null);
  const resolvedSupportRef = useRef<boolean>(false);
  /** Contexto de la conversación al abrir desde reserva/servicio (para mostrar recordatorio). */
  const [chatContext, setChatContext] = useState<{ bookingId: number | null; serviceId: number | null }>({ bookingId: null, serviceId: null });
  const [locationDialogOpen, setLocationDialogOpen] = useState(false);
  const [pendingShareLocation, setPendingShareLocation] = useState<PickedLocation | null>(null);

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
    selectedConversationId != null
      ? (bookingContext?.status === "pending" ||
          bookingContext?.status === "confirmed" ||
          bookingContext?.status === "in_progress"
          ? bookingContext?.serviceTitle != null
            ? `Este chat es sobre la reserva #${bookingContext.id} — ${bookingContext.serviceTitle}. Ambos pueden ver este recordatorio.`
            : `Este chat es sobre la reserva #${bookingContext.id}. Ambos pueden ver este recordatorio.`
          : serviceContext?.title
            ? `Este chat es sobre el servicio: ${serviceContext.title}. Ambos pueden ver este recordatorio.`
            : null)
      : null;

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

  // Resolver links por querystring solo en modo página.
  useEffect(() => {
    if (!allowNavigate) return;
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
  }, [allowNavigate, conversationsQuery.isSuccess, conversations, selectedConversationId, setLocation, setSelectedConversationId]);

  useEffect(() => {
    if (!allowNavigate) return;
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
      { participantId: withUserId, serviceId: serviceId ?? undefined },
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
  }, [allowNavigate, isAuthenticated, conversationsQuery.isSuccess, conversations, getOrCreateConversation, setLocation, toast, setSelectedConversationId]);

  useEffect(() => {
    if (!allowNavigate) return;
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
  }, [allowNavigate, isAuthenticated, conversationsQuery.isSuccess, conversations, getOrCreateConversation, setLocation, toast, setSelectedConversationId]);

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
    if (sendMessage.isPending || selectedConversationId == null) return;
    setPendingShareLocation(null);
    setLocationDialogOpen(true);
  };

  const confirmShareLocation = () => {
    if (!pendingShareLocation) {
      toast({
        variant: "destructive",
        title: "Ubicación requerida",
        description: "Busca una dirección, toca el mapa o usa «Usar mi ubicación actual» antes de enviar.",
      });
      return;
    }
    const content = JSON.stringify({
      lat: pendingShareLocation.lat,
      lng: pendingShareLocation.lon,
      label: pendingShareLocation.label,
    });
    sendMessage.mutate(
      { content, type: "location" },
      {
        onSuccess: () => {
          setLocationDialogOpen(false);
          setPendingShareLocation(null);
        },
        onError: (err) => {
          toast({
            variant: "destructive",
            title: "Error al enviar",
            description: err instanceof Error ? err.message : "No se pudo enviar la ubicación",
          });
        },
      }
    );
  };

  if (authLoading) {
    return (
      <div className={mode === "page" ? "min-h-screen bg-background flex items-center justify-center" : "h-full flex items-center justify-center"}>
        <p className="text-muted-foreground">Cargando...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <ChatUnauthenticated />;
  }

  const rootClassName = mode === "page" ? "min-h-screen bg-background" : "h-full bg-background";

  return (
    <div className={rootClassName}>
      <Dialog
        open={locationDialogOpen}
        onOpenChange={(open) => {
          setLocationDialogOpen(open);
          if (!open) setPendingShareLocation(null);
        }}
      >
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Compartir ubicación</DialogTitle>
            <DialogDescription>
              Elige el punto en el mapa, busca una dirección o usa tu ubicación actual. Luego envía al chat.
            </DialogDescription>
          </DialogHeader>
          <SingleLocationPicker
            value={pendingShareLocation}
            onChange={setPendingShareLocation}
            fieldLabel="Punto a compartir"
            mapSize="sm"
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setLocationDialogOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={confirmShareLocation} disabled={sendMessage.isPending}>
              {sendMessage.isPending ? "Enviando…" : "Enviar ubicación"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* En embedded no mostramos el header de la página, solo el panel */}
      {mode === "embedded" ? (
        <div className="h-full">
          <Card className="h-full overflow-hidden rounded-none border-0 shadow-none">
            <div className="h-full min-h-0">
              {isMobile ? (
                /* Padre flex: sin esto, flex-1 en ChatWindow/MessageList no coge altura (drawer Car Go se ve “chato”). */
                <div className="flex h-full min-h-0 w-full flex-col">
                  {selectedConversation && user ? (
                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
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
                    </div>
                  ) : (
                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
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
                  )}
                </div>
              ) : (
                <div
                  className="grid h-full min-h-0 w-full"
                  style={{ display: "grid", gridTemplateColumns: "320px 1fr" }}
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
              )}
            </div>
          </Card>
        </div>
      ) : (
        <>
          {(isMobile ? true : true) && (
            <section className="bg-gradient-to-r from-primary/20 via-background to-accent/20 border-b border-border">
              <div className="container px-4 py-6 mx-auto max-w-7xl">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                  <div className="flex flex-wrap items-center gap-3">
                    {fromGo && (
                      <Button variant="outline" size="sm" className="gap-2 shrink-0" asChild>
                        <Link href="/go/cargo">
                          <ArrowLeft className="h-4 w-4" />
                          Volver a Go
                        </Link>
                      </Button>
                    )}
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
          )}

          {isMobile ? (
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
          ) : (
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
          )}
        </>
      )}
    </div>
  );
}

