import { User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatListTime } from "@/lib/chat-format";
import type { ConversationEnriched } from "@/types/chat";

interface ConversationListItemProps {
  conversation: ConversationEnriched;
  isSelected: boolean;
  onSelect: () => void;
}

export function ConversationListItem({ conversation, isSelected, onSelect }: ConversationListItemProps) {
  const name = conversation.otherParticipant?.name ?? "Usuario";
  const unread = conversation.unreadCount ?? 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`
        w-full p-3 rounded-lg text-left transition-all flex items-start gap-3
        ${isSelected ? "bg-primary/10 border border-primary/30" : "hover:bg-primary/5 border border-transparent"}
      `}
    >
      <div className="relative shrink-0">
        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
          <User className="w-5 h-5 text-primary" />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <p className="font-medium truncate">{name}</p>
          <span className="text-xs text-muted-foreground shrink-0 ml-1">
            {conversation.lastMessageAt ? formatListTime(conversation.lastMessageAt) : ""}
          </span>
        </div>
        <p className="text-sm text-muted-foreground truncate">
          {conversation.lastMessageText || "Sin mensajes"}
        </p>
        <p className="text-xs text-primary mt-1">
          {conversation.serviceId ? `Servicio #${conversation.serviceId}` : "Chat"}
        </p>
      </div>
      {unread > 0 && !isSelected && (
        <Badge className="bg-primary text-primary-foreground shrink-0">{unread}</Badge>
      )}
    </button>
  );
}
