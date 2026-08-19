import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { CHAT_SYSTEM_SENDER_ID } from "@shared/chat-constants";
import { MessageList } from "@/components/chat/MessageList";
import { MessageInput } from "@/components/chat/MessageInput";
import { formatMessageTime } from "@/lib/chat-format";
import { useToast } from "@/hooks/use-toast";
import { useChatRealtime } from "@/hooks/use-chat";
import { useStoreChatLiveSync, type StoreChatSession } from "@/hooks/use-store-chat";
import { StoreContactChannels } from "@/components/store/StoreContactChannels";
import { cn } from "@/lib/utils";

type StoreEmbeddedChatPanelProps = {
  storeId?: number;
  title?: string;
  subtitle?: string | null;
  session: StoreChatSession | undefined;
  isLoading: boolean;
  error: Error | null;
  chatLocked?: boolean;
  currentUserId: string;
  onSend: (content: string) => Promise<void>;
  isSending: boolean;
  invalidateKeys: readonly (readonly unknown[])[];
  whatsappMessage?: string;
  className?: string;
};

export function StoreEmbeddedChatPanel({
  storeId = 0,
  title,
  subtitle,
  session,
  isLoading,
  error,
  chatLocked = false,
  currentUserId,
  onSend,
  isSending,
  invalidateKeys,
  whatsappMessage,
  className,
}: StoreEmbeddedChatPanelProps) {
  const { toast } = useToast();
  const [messageInput, setMessageInput] = useState("");
  const conversationId = session?.conversationId ?? null;

  useChatRealtime(conversationId);
  useStoreChatLiveSync(storeId, conversationId, invalidateKeys);

  const displayMessages = useMemo(() => {
    const list = session?.messages ?? [];
    return list.map((m) => {
      const isSystem = m.senderId === CHAT_SYSTEM_SENDER_ID || m.type === "system";
      return {
        id: m.id,
        text: String(m.content ?? ""),
        type: m.type,
        time: formatMessageTime(m.createdAt),
        isOwn: !isSystem && String(m.senderId) === currentUserId,
        isSystem,
        status: m.status,
      };
    });
  }, [session?.messages, currentUserId]);

  async function handleSend() {
    const text = messageInput.trim();
    if (!text || chatLocked || session?.chatLocked) return;
    try {
      await onSend(text);
      setMessageInput("");
    } catch (e) {
      toast({
        variant: "destructive",
        title: "No se pudo enviar",
        description: e instanceof Error ? e.message : "Error desconocido",
      });
    }
  }

  const locked = chatLocked || session?.chatLocked;
  const whatsappUrl =
    session?.whatsappUrl ??
    (session?.whatsappPhone ? `https://wa.me/${session.whatsappPhone}` : null);

  return (
    <div className={cn("rounded-2xl border border-border/70 bg-card/95 overflow-hidden", className)}>
      <div className="border-b border-border/60 px-4 py-3 space-y-2">
        {title ? <p className="font-semibold text-sm">{title}</p> : null}
        {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
        {whatsappUrl ? (
          <StoreContactChannels
            whatsappUrl={whatsappUrl}
            whatsappDisplay={session?.whatsappDisplay}
            showChat={false}
            compact
          />
        ) : null}
      </div>

      <div className="flex flex-col min-h-[280px] max-h-[420px]">
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive p-4 text-center">{error.message}</p>
        ) : (
          <>
            <MessageList
              messages={displayMessages}
              isLoading={false}
              firstMessageDate={session?.messages?.[0]?.createdAt ?? null}
              className="flex-1 min-h-0"
            />
            <MessageInput
              value={messageInput}
              onChange={setMessageInput}
              onSend={() => void handleSend()}
              disabled={locked}
              isSending={isSending}
              placeholder={locked ? "Chat cerrado" : "Escribe un mensaje…"}
            />
          </>
        )}
      </div>
    </div>
  );
}
