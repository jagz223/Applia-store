import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useGoChat } from "@/contexts/GoChatContext";
import { ChatPanel } from "@/components/chat/ChatPanel";

export function GoChatDrawer() {
  const { isOpen, closeChat, selectedConversationId, setSelectedConversationId } = useGoChat();

  return (
    <Sheet open={isOpen} onOpenChange={(open) => (!open ? closeChat() : undefined)}>
      <SheetContent side="right" className="w-full p-0 sm:max-w-md">
        <div className="flex h-screen h-[100svh] flex-col">
          <SheetHeader className="border-b border-border px-4 py-3">
            <SheetTitle>Chat</SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1">
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

