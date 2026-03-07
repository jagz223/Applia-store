import { Button } from "@/components/ui/button";
import { User, ArrowLeft, Phone, Video, MoreVertical, FileText, Calendar, MapPin } from "lucide-react";
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
  onBack?: () => void;
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
  onBack,
}: ChatWindowProps) {
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
      <header className="p-4 border-b border-border flex items-center justify-between shrink-0">
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
          <Button type="button" variant="ghost" size="icon" className="hidden sm:flex">
            <Phone className="w-5 h-5" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="hidden sm:flex">
            <Video className="w-5 h-5" />
          </Button>
          <Button type="button" variant="ghost" size="icon">
            <MoreVertical className="w-5 h-5" />
          </Button>
        </div>
      </header>

      <div className="px-4 py-2 border-b border-border flex flex-wrap gap-2 shrink-0">
        <Button type="button" variant="outline" size="sm" className="text-xs h-7 border-border">
          <Calendar className="w-3 h-3 mr-1" />
          Agendar
        </Button>
        <Button type="button" variant="outline" size="sm" className="text-xs h-7 border-border">
          <FileText className="w-3 h-3 mr-1" />
          Compartir contrato
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="text-xs h-7 border-border"
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
