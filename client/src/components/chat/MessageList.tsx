import { useRef, useEffect, useCallback } from "react";
import { MessageBubble } from "./MessageBubble";
import { toDate } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

const SCROLL_LOAD_MORE_THRESHOLD = 80;

interface DisplayMessage {
  id: number;
  text: string;
  type?: string;
  time: string;
  isOwn: boolean;
  /** Mensaje automático (no es de un usuario). */
  isSystem?: boolean;
  status?: string;
}

interface MessageListProps {
  messages: DisplayMessage[];
  isLoading: boolean;
  /** Fecha del primer mensaje para el separador (Date, ISO string o Firestore timestamp) */
  firstMessageDate?: Date | string | { _seconds?: number; _nanoseconds?: number } | null;
  hasMore?: boolean;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  /** Clases extra en el contenedor scroll (p. ej. padding inferior si la barra de envío está fija). */
  className?: string;
  /**
   * Bloque vacío al final del hilo para que el scroll deje hueco bajo la UI fija inferior
   * (barra de herramientas + input en móvil). Mejor que solo padding cuando las alturas cambian.
   */
  bottomReserveClassName?: string;
}

export function MessageList({
  messages,
  isLoading,
  firstMessageDate,
  hasMore,
  onLoadMore,
  isLoadingMore,
  className,
  bottomReserveClassName,
}: MessageListProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);
  const prevLastIdRef = useRef<number | null>(null);
  const scrollHeightBeforeLoadMoreRef = useRef<number | null>(null);
  const justRestoredRef = useRef(false);

  // Restaurar posición al cargar más mensajes arriba (prepend)
  useEffect(() => {
    const el = scrollContainerRef.current;
    const prevHeight = scrollHeightBeforeLoadMoreRef.current;
    if (el && prevHeight != null && messages.length > 0) {
      scrollHeightBeforeLoadMoreRef.current = null;
      justRestoredRef.current = true;
      const newHeight = el.scrollHeight;
      el.scrollTop = newHeight - prevHeight;
    }
  }, [messages.length]);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el || !hasMore || isLoadingMore || !onLoadMore) return;
    if (el.scrollTop <= SCROLL_LOAD_MORE_THRESHOLD) {
      scrollHeightBeforeLoadMoreRef.current = el.scrollHeight;
      onLoadMore();
    }
  }, [hasMore, isLoadingMore, onLoadMore]);

  // Solo hacer scroll al final cuando llegan mensajes nuevos al final (no tras cargar más arriba)
  useEffect(() => {
    const count = messages.length;
    const lastId = count > 0 ? messages[count - 1].id : null;
    const hadMessages = prevCountRef.current > 0;
    const lastMessageChanged = lastId !== prevLastIdRef.current;

    prevCountRef.current = count;
    prevLastIdRef.current = lastId;

    if (count === 0) return;
    if (justRestoredRef.current) {
      justRestoredRef.current = false;
      return;
    }
    if (!hadMessages || lastMessageChanged) {
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
    <div
      ref={scrollContainerRef}
      className={cn("min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-4", className)}
      onScroll={handleScroll}
    >
      <div className="space-y-4">
        {dateLabel && (
          <div className="flex items-center justify-center">
            <span className="text-xs text-muted-foreground bg-card px-3 py-1 rounded-full capitalize">
              {dateLabel}
            </span>
          </div>
        )}
        {hasMore && (
          <div className="flex justify-center py-2">
            {isLoadingMore ? (
              <span className="text-xs text-muted-foreground">Cargando más...</span>
            ) : (
              <span className="text-xs text-muted-foreground">Sube para ver más</span>
            )}
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
              isSystem={msg.isSystem}
              status={msg.status}
            />
          ))
        )}
        {bottomReserveClassName ? (
          <div className={cn("shrink-0 w-full", bottomReserveClassName)} aria-hidden />
        ) : null}
      </div>
    </div>
  );
}
