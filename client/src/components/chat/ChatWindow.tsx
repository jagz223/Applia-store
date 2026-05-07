import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { User, ArrowLeft, MapPin, Bell, BellOff, Loader2, Info } from "lucide-react";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { useAuth } from "@/hooks/use-auth";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { formatMessageTime } from "@/lib/chat-format";
import type { ReactNode } from "react";
import type { ConversationEnriched } from "@/types/chat";
import type { Message } from "@/types/chat";
import { cn } from "@/lib/utils";
import { CHAT_SYSTEM_SENDER_ID } from "@shared/chat-constants";

interface ChatWindowProps {
  conversation: ConversationEnriched;
  messages: Message[];
  currentUserId: string;
  messageInput: string;
  onMessageInputChange: (value: string) => void;
  onSendMessage: () => void;
  onShareLocation?: () => void;
  isSending: boolean;
  isLoadingMessages: boolean;
  hasMoreMessages?: boolean;
  onLoadMoreMessages?: () => void;
  isLoadingMoreMessages?: boolean;
  onBack?: () => void;
  /** Recordatorio de contexto (reserva / servicio); se muestra en franja destacada. */
  reminderText?: string | null;
  /** Botones extra (p. ej. profesional: gestionar reserva o editar servicio). */
  reminderActions?: ReactNode;
  /**
   * Página /chat en móvil: barra de escritura fija al borde inferior del viewport (evita hueco debajo).
   * En escritorio / embedded no se usa.
   */
  pinInputToBottom?: boolean;
}

export function ChatWindow({
  conversation,
  messages,
  currentUserId,
  messageInput,
  onMessageInputChange,
  onSendMessage,
  onShareLocation,
  isSending,
  isLoadingMessages,
  hasMoreMessages,
  onLoadMoreMessages,
  isLoadingMoreMessages,
  onBack,
  reminderText,
  reminderActions,
  pinInputToBottom = false,
}: ChatWindowProps) {
  const { user } = useAuth();
  const push = usePushNotifications();
  const otherAvatarUrl = conversation.otherParticipant?.profileImageUrl ?? null;
  const otherFullName = [conversation.otherParticipant?.name ?? "Usuario", conversation.otherParticipant?.lastName ?? ""]
    .filter(Boolean)
    .join(" ")
    .trim();
  const myAvatarUrl =
    (user as any)?.profileImageUrl ||
    (user as any)?.profile_image_url ||
    (user as any)?.imageUrl ||
    null;
  const displayMessages = messages.map((m) => {
    const body = String(m.content ?? "").trim();
    const looksLikeLegacyStatusNotice =
      /^\[Reserva #\d+\]/i.test(body) && /estado/i.test(body);
    const looksLikeStatusLine = /^La reserva #\d+ pasó al estado «[^»]+»\.?$/i.test(body);
    const isSystem =
      m.type === "system" ||
      m.senderId === CHAT_SYSTEM_SENDER_ID ||
      /^Mensaje del sistema:/i.test(body) ||
      looksLikeStatusLine ||
      looksLikeLegacyStatusNotice;
    return {
      id: m.id,
      text: m.content,
      type: m.type ?? "text",
      time: formatMessageTime(m.createdAt),
      isOwn: !isSystem && currentUserId === m.senderId,
      isSystem,
      status: m.status ?? "sent",
      avatarUrl: isSystem ? null : currentUserId === m.senderId ? myAvatarUrl : otherAvatarUrl,
    };
  });

  const firstDate = messages[0]?.createdAt;

  const attachDisabled = isSending || !!conversation.otherParticipant?.isDeleted;

  const showReminderStrip = Boolean(reminderText) || Boolean(reminderActions);

  return (
    <div className="flex h-full min-h-0 w-full max-w-full flex-1 flex-col overflow-hidden">
      <div className="min-h-0 min-w-0 shrink-0">
        {showReminderStrip ? (
          <div
            className={cn(
              "border-b-2 border-primary/45 bg-gradient-to-r from-primary/[0.2] via-primary/[0.11] to-accent/15",
              "px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:px-4 sm:py-3.5",
            )}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div className="flex min-w-0 flex-1 gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/25 ring-2 ring-primary/35 shadow-sm">
                  <Info className="h-5 w-5 text-primary" aria-hidden />
                </div>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-primary sm:text-[11px]">
                    Contexto del servicio
                  </p>
                  {reminderText ? (
                    <p className="text-sm font-semibold leading-snug text-foreground sm:text-base">{reminderText}</p>
                  ) : (
                    <p className="text-sm font-medium leading-snug text-muted-foreground">
                      Herramientas de gestión para tu actividad como asociado.
                    </p>
                  )}
                </div>
              </div>
              {reminderActions ? (
                <div className="flex shrink-0 flex-wrap gap-2 sm:max-w-[min(100%,20rem)] sm:justify-end">{reminderActions}</div>
              ) : null}
            </div>
          </div>
        ) : null}
        <header className="p-4 border-b border-border flex items-center justify-between min-w-0">
        <div className="flex items-center gap-3">
          {onBack && (
            <Button variant="ghost" size="icon" className="md:hidden" onClick={onBack}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
          )}
          {otherAvatarUrl ? (
            <img src={otherAvatarUrl} alt="" className="w-10 h-10 rounded-full object-cover ring-2 ring-primary/20 shrink-0" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
              <User className="w-5 h-5 text-primary" />
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <p className={`font-medium ${conversation.otherParticipant?.isDeleted ? "text-muted-foreground italic" : ""}`}>
                {otherFullName || "Usuario"}
              </p>
              {conversation.otherParticipant?.isDeleted && (
                <Badge variant="outline" className="text-[10px] h-4 px-1 text-muted-foreground border-muted-foreground">
                  Deshabilitado
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Mensajes</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0"
                onClick={() => push.register()}
                disabled={!push.isSupported || push.isRegistering || (push.permission === "granted" && push.token != null)}
                aria-label="Notificaciones Push"
              >
                {push.isRegistering ? (
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                ) : push.permission === "granted" && push.token ? (
                  <Bell className="w-5 h-5 text-primary" />
                ) : (
                  <BellOff className="w-5 h-5 text-muted-foreground" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[260px]">
              {!push.isSupported ? (
                <p className="text-xs text-muted-foreground">Notificaciones Push no disponibles en este navegador.</p>
              ) : push.permission === "denied" ? (
                <p className="text-xs">
                  Notificaciones bloqueadas. Actívalas en Configuración del navegador → Privacidad y seguridad → Configuración de sitios → Notificaciones.
                </p>
              ) : push.permission === "granted" && push.token ? (
                <p>Notificaciones Push activas</p>
              ) : push.error ? (
                <p className="text-xs text-destructive">{push.error}</p>
              ) : (
                <p>Notificaciones Push — clic para activar</p>
              )}
            </TooltipContent>
          </Tooltip>
        </div>
      </header>

        {onShareLocation ? (
          <div className="px-4 py-2 border-b border-border flex flex-wrap gap-2 min-w-0 overflow-hidden">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs h-7 border-border shrink-0"
              onClick={onShareLocation}
              disabled={attachDisabled}
            >
              <MapPin className="w-3 h-3 mr-1" />
              Ubicación
            </Button>
          </div>
        ) : null}
      </div>

      {/* Lista scroll; en móvil /chat la barra de envío va fija abajo (pinInputToBottom). */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <MessageList
          messages={displayMessages}
          isLoading={isLoadingMessages}
          firstMessageDate={firstDate}
          hasMore={hasMoreMessages}
          onLoadMore={onLoadMoreMessages}
          isLoadingMore={isLoadingMoreMessages}
          className={
            pinInputToBottom
              ? "pb-[calc(5.75rem+env(safe-area-inset-bottom,0px))]"
              : undefined
          }
        />
        {!pinInputToBottom ? (
          <div className="shrink-0 bg-background">
            <MessageInput
              value={messageInput}
              onChange={onMessageInputChange}
              onSend={onSendMessage}
              isSending={isSending}
              disabled={isSending || !!conversation.otherParticipant?.isDeleted}
              placeholder={conversation.otherParticipant?.isDeleted ? "No puedes enviar mensajes a un usuario deshabilitado" : undefined}
            />
          </div>
        ) : null}
      </div>
      {pinInputToBottom ? (
        <div
          className={cn(
            "fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 shadow-[0_-8px_32px_rgba(0,0,0,0.18)] backdrop-blur-sm supports-[backdrop-filter]:bg-background/90",
            "pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-1",
          )}
        >
          <MessageInput
            value={messageInput}
            onChange={onMessageInputChange}
            onSend={onSendMessage}
            isSending={isSending}
            disabled={isSending || !!conversation.otherParticipant?.isDeleted}
            placeholder={conversation.otherParticipant?.isDeleted ? "No puedes enviar mensajes a un usuario deshabilitado" : undefined}
            className="border-t-0"
          />
        </div>
      ) : null}
    </div>
  );
}
