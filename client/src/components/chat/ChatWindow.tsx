import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { User, ArrowLeft, FileText, Calendar, MapPin, Bell, BellOff, Loader2, Info } from "lucide-react";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { formatMessageTime } from "@/lib/chat-format";
import type { ConversationEnriched } from "@/types/chat";
import type { Message } from "@/types/chat";

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
  /** Pequeño recordatorio de contexto (ej. "Este chat es sobre la reserva #X — Servicio Y"). */
  reminderText?: string | null;
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
}: ChatWindowProps) {
  const push = usePushNotifications();
  const displayMessages = messages.map((m) => ({
    id: m.id,
    text: m.content,
    type: m.type ?? "text",
    time: formatMessageTime(m.createdAt),
    isOwn: currentUserId === m.senderId,
    status: m.status ?? "sent",
  }));

  const firstDate = messages[0]?.createdAt;

  return (
    <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
      {reminderText && (
        <div className="shrink-0 px-3 py-2 bg-primary/10 border-b border-primary/20 flex items-center gap-2 text-sm text-foreground">
          <Info className="h-4 w-4 shrink-0 text-primary" />
          <span>{reminderText}</span>
        </div>
      )}
      <header className="p-4 border-b border-border flex items-center justify-between shrink-0 min-w-0">
        <div className="flex items-center gap-3">
          {onBack && (
            <Button variant="ghost" size="icon" className="md:hidden" onClick={onBack}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
          )}
          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
            <User className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="font-medium">{conversation.otherParticipant?.name ?? "Usuario"}</p>
            <p className="text-xs text-muted-foreground">Chat</p>
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

      <div className="px-4 py-2 border-b border-border flex flex-wrap gap-2 shrink-0 min-w-0 overflow-hidden">
        <Button type="button" variant="outline" size="sm" className="text-xs h-7 border-border shrink-0">
          <Calendar className="w-3 h-3 mr-1" />
          Agendar
        </Button>
        <Button type="button" variant="outline" size="sm" className="text-xs h-7 border-border shrink-0">
          <FileText className="w-3 h-3 mr-1" />
          Compartir contrato
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="text-xs h-7 border-border shrink-0"
          onClick={onShareLocation}
          disabled={isSending}
        >
          <MapPin className="w-3 h-3 mr-1" />
          Ubicación
        </Button>
      </div>

      <MessageList
        messages={displayMessages}
        isLoading={isLoadingMessages}
        firstMessageDate={firstDate}
        hasMore={hasMoreMessages}
        onLoadMore={onLoadMoreMessages}
        isLoadingMore={isLoadingMoreMessages}
      />

      <MessageInput
        value={messageInput}
        onChange={onMessageInputChange}
        onSend={onSendMessage}
        isSending={isSending}
      />
    </div>
  );
}
