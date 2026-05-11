import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { ChatProviderBookingModal } from "@/components/chat/ChatProviderBookingModal";
import { ChatClientBookingModal } from "@/components/chat/ChatClientBookingModal";
import { SingleLocationPicker, type PickedLocation } from "@/components/taxi/SingleLocationPicker";
import { ArrowLeft, MessageSquare } from "lucide-react";
import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSocket } from "@/hooks/use-socket";
import type { ConversationEnriched } from "@/types/chat";

type Props = {
  mode: "page" | "embedded";
  selectedConversationId?: number | null;
  onSelectedConversationIdChange?: (id: number | null) => void;
};

/** Altura del área de chat (viewport menos header aproximado). */
const CHAT_AREA_HEIGHT = "calc(100vh - 280px)";
const CHAT_AREA_MIN_HEIGHT = 500;

/** Deja `/chat?conversation=id` para que F5 y nuevas visitas mantengan el hilo y el recordatorio de reserva/servicio. */
function setConversationInUrl(
  setLocation: (path: string, opts?: { replace?: boolean }) => void,
  conversationId: number,
  opts?: { clearDeepLink?: boolean },
) {
  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  if (opts?.clearDeepLink) {
    params.delete("with");
    params.delete("bookingId");
    params.delete("serviceId");
  }
  params.set("conversation", String(conversationId));
  const qs = params.toString();
  setLocation(`/chat?${qs}`, { replace: true });
}

function stripConversationFromUrl(setLocation: (path: string, opts?: { replace?: boolean }) => void) {
  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  params.delete("conversation");
  const qs = params.toString();
  setLocation(qs ? `/chat?${qs}` : "/chat", { replace: true });
}

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
  const isMobile = useIsMobile();
  /** Evita bucles; incluye bookingId/serviceId para que un mismo `with` abra otro hilo al cambiar de reserva. */
  const resolvedChatDeepLinkRef = useRef<string | null>(null);
  const resolvedSupportRef = useRef<boolean>(false);
  /** Contexto de la conversación al abrir desde reserva/servicio (para mostrar recordatorio). */
  const [chatContext, setChatContext] = useState<{ bookingId: number | null; serviceId: number | null }>({ bookingId: null, serviceId: null });
  const [locationDialogOpen, setLocationDialogOpen] = useState(false);
  const [pendingShareLocation, setPendingShareLocation] = useState<PickedLocation | null>(null);

  const queryClient = useQueryClient();
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

  /** Prioridad: datos de la conversación en API (persisten sin query ?bookingId=). Fallback: deep link en chatContext. */
  const { bookingIdForContext, serviceIdForContext } = useMemo(() => {
    if (selectedConversationId == null) {
      return { bookingIdForContext: null as number | null, serviceIdForContext: null as number | null };
    }
    if (!selectedConversation) {
      const bid = chatContext.bookingId ? chatContext.bookingId : null;
      const sid =
        chatContext.serviceId != null && bid == null ? chatContext.serviceId : null;
      return { bookingIdForContext: bid, serviceIdForContext: sid };
    }
    let bookingIdForContext: number | null = null;
    const bidRaw = selectedConversation.bookingId as unknown;
    if (bidRaw != null && String(bidRaw).trim() !== "") {
      const n = Number(bidRaw);
      if (Number.isFinite(n)) bookingIdForContext = n;
    }
    if (bookingIdForContext == null && chatContext.bookingId != null) {
      bookingIdForContext = chatContext.bookingId;
    }

    let serviceIdForContext: number | null = null;
    if (bookingIdForContext == null) {
      const sidRaw = selectedConversation.serviceId as unknown;
      if (sidRaw != null && String(sidRaw).trim() !== "") {
        const n = Number(sidRaw);
        if (Number.isFinite(n)) serviceIdForContext = n;
      }
      if (serviceIdForContext == null && chatContext.serviceId != null) {
        serviceIdForContext = chatContext.serviceId;
      }
    }
    return { bookingIdForContext, serviceIdForContext };
  }, [
    selectedConversationId,
    selectedConversation,
    chatContext.bookingId,
    chatContext.serviceId,
  ]);
  const { data: bookingContext } = useQuery({
    queryKey: ["booking", bookingIdForContext],
    queryFn: async () => {
      const res = await fetch(`/api/bookings/${bookingIdForContext}`);
      if (!res.ok) throw new Error("Reserva no encontrada");
      return res.json() as Promise<{
        id: number;
        serviceTitle?: string;
        status?: string;
        providerId?: number;
        userId?: string;
      }>;
    },
    enabled: !!bookingIdForContext,
  });
  const { data: serviceContext } = useQuery({
    queryKey: ["service", serviceIdForContext],
    queryFn: async () => {
      const res = await fetch(`/api/services/${serviceIdForContext}`);
      if (!res.ok) throw new Error("Servicio no encontrado");
      return res.json() as Promise<{ id: number; title?: string; providerId?: number }>;
    },
    enabled: !!serviceIdForContext,
  });

  const graceBannerText =
    selectedConversation?.serviceChatHideFromUsersAt &&
    new Date(selectedConversation.serviceChatHideFromUsersAt).getTime() > Date.now()
      ? (() => {
          const until = new Date(selectedConversation.serviceChatHideFromUsersAt as string);
          if (Number.isNaN(until.getTime())) return null;
          const rel = formatDistanceToNow(until, { locale: es, addSuffix: true });
          return `El servicio ya no está activo. Esta conversación se archivará de tu vista ${rel}; guarda lo que necesites antes.`;
        })()
      : null;

  const priceAgreementHint =
    " Coordinen entre ambos el precio del servicio de forma mutua (por este chat u otro canal); la app no publica ni exige un importe fijo por servicio.";

  const bookingOrServiceReminder =
    selectedConversationId != null
      ? bookingContext?.status === "pending" ||
          bookingContext?.status === "confirmed" ||
          bookingContext?.status === "in_progress"
        ? bookingContext?.serviceTitle != null
          ? `Este chat es sobre la reserva #${bookingContext.id} — ${bookingContext.serviceTitle}. Ambos pueden ver este recordatorio.${priceAgreementHint}`
          : `Este chat es sobre la reserva #${bookingContext.id}. Ambos pueden ver este recordatorio.${priceAgreementHint}`
        : serviceContext?.title
          ? `Este chat es sobre el servicio: ${serviceContext.title}. Ambos pueden ver este recordatorio.${priceAgreementHint}`
          : null
      : null;

  const chatReminderText = graceBannerText ?? bookingOrServiceReminder;

  const serviceChatLocked =
    selectedConversation?.messagesLocked === true ||
    (selectedConversation?.serviceEndedAt != null &&
      String(selectedConversation.serviceEndedAt).trim() !== "");

  const [providerBookingModalOpen, setProviderBookingModalOpen] = useState(false);
  const [clientBookingModalOpen, setClientBookingModalOpen] = useState(false);

  const bookingPayload = bookingContext as { providerId?: number; userId?: string } | undefined;
  const servicePayload = serviceContext as { providerId?: number } | undefined;
  const myProviderId = user?.provider?.id;

  const showProviderBookingTools =
    myProviderId != null &&
    bookingIdForContext != null &&
    bookingPayload?.providerId === myProviderId;

  const showClientBookingTools =
    user?.id != null &&
    bookingIdForContext != null &&
    String(bookingPayload?.userId ?? "") === String(user.id) &&
    !showProviderBookingTools;

  const showProviderServiceTools =
    myProviderId != null &&
    serviceIdForContext != null &&
    bookingIdForContext == null &&
    servicePayload?.providerId === myProviderId;

  const reminderActions =
    showProviderBookingTools || showProviderServiceTools || showClientBookingTools ? (
      <>
        {showProviderBookingTools ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="border-primary/40 bg-background font-semibold shadow-sm hover:bg-primary/15"
            onClick={() => setProviderBookingModalOpen(true)}
          >
            Gestionar reserva
          </Button>
        ) : null}
        {showClientBookingTools ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="border-primary/40 bg-background font-semibold shadow-sm hover:bg-primary/15"
            onClick={() => setClientBookingModalOpen(true)}
          >
            Gestionar mi reserva
          </Button>
        ) : null}
        {showProviderServiceTools ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="border-primary/40 bg-background font-semibold shadow-sm"
            asChild
          >
            <Link href={`/edit-service/${serviceIdForContext}`}>Editar mi servicio</Link>
          </Button>
        ) : null}
      </>
    ) : undefined;

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

  const handleBackFromChat = useCallback(() => {
    setSelectedConversationId(null);
    if (allowNavigate) stripConversationFromUrl(setLocation);
  }, [allowNavigate, setLocation, setSelectedConversationId]);

  // Si el usuario elige un chat desde la lista pero la URL no lleva ?conversation=, sincronizar (F5 conserva hilo y banner).
  useEffect(() => {
    if (!allowNavigate) return;
    if (typeof window === "undefined") return;
    if (selectedConversationId == null) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("conversation") === String(selectedConversationId)) return;
    setConversationInUrl(setLocation, selectedConversationId);
  }, [allowNavigate, selectedConversationId, setLocation]);

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
      params.set("conversation", String(id));
      setLocation(params.toString() ? `/chat?${params.toString()}` : "/chat", { replace: true });
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
      resolvedChatDeepLinkRef.current = null;
      return;
    }

    const resolveKey = `with:${withUserId}|b:${bookingId ?? ""}|s:${serviceId ?? ""}`;
    if (resolvedChatDeepLinkRef.current === resolveKey) return;

    const matchesPeer = (c: ConversationEnriched) =>
      c.otherParticipant?.id === withUserId ||
      c.participant1Id === withUserId ||
      c.participant2Id === withUserId;

    const pickFromList = (list: ConversationEnriched[]) => {
      if (bookingId != null && !Number.isNaN(bookingId)) {
        return list.find((c) => matchesPeer(c) && Number(c.bookingId) === bookingId);
      }
      return list.find(matchesPeer);
    };

    const existing = pickFromList(conversations);
    if (existing) {
      resolvedChatDeepLinkRef.current = resolveKey;
      setSelectedConversationId(existing.id);
      setConversationInUrl(setLocation, existing.id, { clearDeepLink: true });
      return;
    }

    // Reserva marketplace: cada bookingId tiene su propio hilo; no reutilizar el chat genérico con el mismo usuario.
    if (bookingId != null && !Number.isNaN(bookingId)) {
      const pendingMarker = `pending:${resolveKey}`;
      if (resolvedChatDeepLinkRef.current === pendingMarker || resolvedChatDeepLinkRef.current === resolveKey) {
        return;
      }
      resolvedChatDeepLinkRef.current = pendingMarker;

      let cancelled = false;
      const run = async () => {
        const token = localStorage.getItem("token");
        for (let attempt = 0; attempt < 14 && !cancelled; attempt++) {
          const list =
            queryClient.getQueryData<ConversationEnriched[]>(["chat", "conversations"]) ?? conversations;
          const fromList = pickFromList(list);
          if (fromList) {
            resolvedChatDeepLinkRef.current = resolveKey;
            setSelectedConversationId(fromList.id);
            setConversationInUrl(setLocation, fromList.id, { clearDeepLink: true });
            return;
          }
          const res = await fetch(`/api/bookings/${bookingId}/chat-conversation`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          if (res.ok) {
            const data = (await res.json()) as { conversationId: number };
            resolvedChatDeepLinkRef.current = resolveKey;
            void queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] });
            setSelectedConversationId(data.conversationId);
            setConversationInUrl(setLocation, data.conversationId, { clearDeepLink: true });
            return;
          }
          await new Promise((r) => setTimeout(r, 380));
          await queryClient.refetchQueries({ queryKey: ["chat", "conversations"] });
        }
        if (!cancelled) {
          if (resolvedChatDeepLinkRef.current === pendingMarker) {
            resolvedChatDeepLinkRef.current = null;
          }
          toast({
            variant: "destructive",
            title: "Chat de la reserva",
            description:
              "No se pudo abrir el chat de esta reserva todavía. Cierra y vuelve a entrar desde Mis reservas o espera unos segundos.",
          });
        }
      };
      void run();
      return () => {
        cancelled = true;
      };
    }

    getOrCreateConversation.mutate(
      { participantId: withUserId, serviceId: serviceId ?? undefined },
      {
        onSuccess: (conversationId) => {
          resolvedChatDeepLinkRef.current = resolveKey;
          setSelectedConversationId(conversationId);
          setConversationInUrl(setLocation, conversationId, { clearDeepLink: true });
        },
        onError: (err) => {
          resolvedChatDeepLinkRef.current = null;
          toast({
            variant: "destructive",
            title: "Error",
            description: err instanceof Error ? err.message : "No se pudo abrir la conversación",
          });
        },
      }
    );
  }, [
    allowNavigate,
    isAuthenticated,
    conversationsQuery.isSuccess,
    conversations,
    getOrCreateConversation,
    setLocation,
    toast,
    setSelectedConversationId,
    queryClient,
  ]);

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
        setConversationInUrl(setLocation, existing.id);
        return;
      }
      getOrCreateConversation.mutate(
        { participantId: adminId },
        {
          onSuccess: (conversationId) => {
            setSelectedConversationId(conversationId);
            setConversationInUrl(setLocation, conversationId);
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

  const handleSendMessage = () => {
    if (serviceChatLocked) return;
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
    if (serviceChatLocked || sendMessage.isPending || selectedConversationId == null) return;
    setPendingShareLocation(null);
    setLocationDialogOpen(true);
  };

  const confirmShareLocation = () => {
    if (serviceChatLocked) return;
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

  const rootClassName =
    mode === "page" ? "flex min-h-0 flex-1 flex-col bg-background" : "h-full bg-background";

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
                        onBack={handleBackFromChat}
                        reminderText={chatReminderText ?? undefined}
                        reminderActions={reminderActions}
                        chatLocked={serviceChatLocked}
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
                        onBack={handleBackFromChat}
                        reminderText={chatReminderText ?? undefined}
                        reminderActions={reminderActions}
                        chatLocked={serviceChatLocked}
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
          {!isMobile && (
            <section className="bg-gradient-to-r from-primary/20 via-background to-accent/20 border-b border-border">
              <div className="container px-4 py-6 mx-auto max-w-7xl">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                  <div className="flex flex-wrap items-center gap-3">
                    {fromGo && (
                      <Button variant="outline" size="sm" className="gap-2 shrink-0" asChild>
                        <Link href="/go/taxi">
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
            <div className="flex min-h-0 flex-1 flex-col md:hidden">
              <header className="shrink-0 border-b border-border bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-primary/15 p-2">
                    <MessageSquare className="h-5 w-5 text-primary" aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <p className="text-base font-semibold leading-tight">Chat</p>
                    <p className="truncate text-xs text-muted-foreground">Mensajes en vivo</p>
                  </div>
                </div>
              </header>
              <Card className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-none border-0 border-x-0 shadow-none">
                <div className="flex h-full min-h-0 w-full flex-col">
                  {selectedConversation && user ? (
                    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
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
                        onBack={handleBackFromChat}
                        reminderText={chatReminderText ?? undefined}
                        reminderActions={reminderActions}
                        pinInputToBottom
                        chatLocked={serviceChatLocked}
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
              </Card>
            </div>
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
                          onBack={handleBackFromChat}
                          reminderText={chatReminderText ?? undefined}
                          reminderActions={reminderActions}
                          chatLocked={serviceChatLocked}
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
      <ChatProviderBookingModal
        open={providerBookingModalOpen}
        onOpenChange={setProviderBookingModalOpen}
        bookingId={bookingIdForContext}
        conversationId={selectedConversationId}
      />
      <ChatClientBookingModal
        open={clientBookingModalOpen}
        onOpenChange={setClientBookingModalOpen}
        bookingId={bookingIdForContext}
        conversationId={selectedConversationId}
        associateUserId={recipientId ?? null}
        ownershipVerified={showClientBookingTools}
      />
    </div>
  );
}

