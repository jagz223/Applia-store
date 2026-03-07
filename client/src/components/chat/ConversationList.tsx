import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { ConversationListItem } from "./ConversationListItem";
import type { ConversationEnriched } from "@/types/chat";

interface ConversationListProps {
  conversations: ConversationEnriched[];
  searchQuery: string;
  onSearchChange: (value: string) => void;
  selectedId: number | null;
  onSelectConversation: (id: number) => void;
  isLoading: boolean;
  isError?: boolean;
  error?: Error | null;
  onRetry?: () => void;
}

export function ConversationList({
  conversations,
  searchQuery,
  onSearchChange,
  selectedId,
  onSelectConversation,
  isLoading,
  isError,
  error,
  onRetry,
}: ConversationListProps) {
  const filtered = conversations.filter((c) =>
    (c.otherParticipant?.name ?? "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="border-r border-border flex flex-col h-full min-h-0">
      <div className="p-4 border-b border-border shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar conversaciones..."
            className="input-industrial pl-10"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-2 space-y-1">
          {isError ? (
            <div className="p-4 text-sm">
              <p className="text-destructive mb-2">{error?.message ?? "Error al cargar"}</p>
              {onRetry && (
                <button type="button" onClick={onRetry} className="text-primary underline">
                  Reintentar
                </button>
              )}
            </div>
          ) : isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Cargando conversaciones...</p>
          ) : filtered.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No hay conversaciones aún.</p>
          ) : (
            filtered.map((conversation) => (
              <ConversationListItem
                key={conversation.id}
                conversation={conversation}
                isSelected={selectedId === conversation.id}
                onSelect={() => onSelectConversation(conversation.id)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
