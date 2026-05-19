import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useGoChat } from "@/contexts/GoChatContext";
import { ChatPanel } from "@/components/chat/ChatPanel";

/** Ancho del panel en escritorio: lista + hilo (evita columna de chat de ~100px con max-w-md). */
const SHEET_WIDTH =
  "w-full max-w-[100vw] sm:max-w-md md:max-w-2xl lg:max-w-4xl xl:max-w-[min(960px,calc(100vw-2rem))]";

export function GoChatDrawer() {
  const { isOpen, closeChat, selectedConversationId, setSelectedConversationId, mobilityChatReminder } = useGoChat();

  return (
    <Sheet open={isOpen} onOpenChange={(open) => (!open ? closeChat() : undefined)}>
      <SheetContent side="right" className={`flex h-full min-h-0 flex-col overflow-hidden p-0 ${SHEET_WIDTH}`}>
        <div className="flex h-full min-h-0 w-full flex-col">
          <SheetHeader className="shrink-0 border-b border-border px-4 py-3 pr-12">
            <SheetTitle>Chat</SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-hidden">
            <ChatPanel
              mode="embedded"
              selectedConversationId={selectedConversationId}
              onSelectedConversationIdChange={setSelectedConversationId}
              mobilityEmbeddedReminder={mobilityChatReminder}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
