import { useRef, useEffect } from "react";
import { MessageBubble } from "./MessageBubble";
import { toDate } from "@/lib/date-utils";

interface DisplayMessage {
  id: number;
  text: string;
  type?: string;
  time: string;
  isOwn: boolean;
  status?: string;
}

interface MessageListProps {
  messages: DisplayMessage[];
  isLoading: boolean;
  /** Fecha del primer mensaje para el separador (Date, ISO string o Firestore timestamp) */
  firstMessageDate?: Date | string | { _seconds?: number; _nanoseconds?: number } | null;
}

export function MessageList({ messages, isLoading, firstMessageDate }: MessageListProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);
  const prevLastIdRef = useRef<number | null>(null);

  // Solo hacer scroll al final del contenedor del chat (no la página) cuando se añaden mensajes nuevos
  useEffect(() => {
    const count = messages.length;
    const lastId = count > 0 ? messages[count - 1].id : null;
    const hadMessages = prevCountRef.current > 0;
    const countIncreased = count > prevCountRef.current;
    const lastMessageChanged = lastId !== prevLastIdRef.current;

    prevCountRef.current = count;
    prevLastIdRef.current = lastId;

    if (count === 0) return;
    if (!hadMessages || countIncreased || (count === 1 && lastMessageChanged)) {
      const el = scrollContainerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [messages.length, messages.length > 0 ? messages[messages.length - 1]?.id : null]);

  const dateLabel =
    firstMessageDate != null
      ? (() => {
          const d = toDate(firstMessageDate);
          const now = new Date();
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const dDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
          if (dDate.getTime() === today.getTime()) return "Hoy";
          return d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
        })()
      : null;

  return (
    <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-y-auto p-4">
      <div className="space-y-4">
        {dateLabel && (
          <div className="flex items-center justify-center">
            <span className="text-xs text-muted-foreground bg-card px-3 py-1 rounded-full capitalize">
              {dateLabel}
            </span>
          </div>
        )}
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando mensajes...</p>
        ) : (
          messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              text={msg.text}
              type={msg.type}
              time={msg.time}
              isOwn={msg.isOwn}
              status={msg.status}
            />
          ))
        )}
      </div>
    </div>
  );
}
