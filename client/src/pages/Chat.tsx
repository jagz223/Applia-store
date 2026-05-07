import { ChatPanel } from "@/components/chat/ChatPanel";

export default function Chat() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ChatPanel mode="page" />
    </div>
  );
}
