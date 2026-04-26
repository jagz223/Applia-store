import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useGoChat } from "@/contexts/GoChatContext";
import { ChatPanel } from "@/components/chat/ChatPanel";

export function GoChatDrawer() {
  const { isOpen, closeChat, selectedConversationId, setSelectedConversationId } = useGoChat();

  return (
    <Sheet open={isOpen} onOpenChange={(open) => (!open ? closeChat() : undefined)}>
      <SheetContent
        side="right"
        className="flex h-full w-full min-h-0 max-w-full flex-col overflow-hidden p-0 sm:max-w-md"
      >
        <div className="flex h-full min-h-0 w-full max-w-full flex-col">
          <SheetHeader className="shrink-0 border-b border-border px-4 py-3">
            <SheetTitle>Chat</SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-hidden">
            <ChatPanel
              mode="embedded"
              selectedConversationId={selectedConversationId}
              onSelectedConversationIdChange={setSelectedConversationId}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

