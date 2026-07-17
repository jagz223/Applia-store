import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Bot, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { UI_Z_HELP_CHAT } from "@/lib/modal-layer-z";
import { DESKTOP_MIN_WIDTH_PX, useDesktopViewport } from "@/hooks/use-desktop-viewport";
import { useHelpAiChat } from "@/hooks/use-help-ai-chat";
import { HelpAiChatPanel } from "@/components/help/HelpAiChatPanel";

/** Permite desactivar el widget sin quitar código (VITE_HELP_AI_CHAT_ENABLED=false). */
function isHelpAiChatFeatureEnabled(): boolean {
  const raw = import.meta.env.VITE_HELP_AI_CHAT_ENABLED;
  if (raw === undefined || raw === "") return true;
  return raw === "true" || raw === "1";
}

/**
 * Burbuja flotante de ayuda con IA (esquina inferior derecha).
 * Solo escritorio (≥1024px). Portal en document.body.
 */
export function HelpAiChatWidget() {
  const [mounted, setMounted] = useState(false);
  const isDesktop = useDesktopViewport();
  const [open, setOpen] = useState(false);
  const { messages, loading, sendMessage, resetChat } = useHelpAiChat();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isHelpAiChatFeatureEnabled() || !mounted || !isDesktop) {
    return null;
  }

  return createPortal(
    <div
      className={cn(
        "pointer-events-none fixed bottom-6 right-6 flex flex-col items-end gap-3",
        UI_Z_HELP_CHAT,
      )}
      aria-live="polite"
      data-help-ai-chat="true"
      data-min-width={DESKTOP_MIN_WIDTH_PX}
    >
      <HelpAiChatPanel
        open={open}
        onClose={() => setOpen(false)}
        messages={messages}
        loading={loading}
        onSend={sendMessage}
        onReset={resetChat}
      />

      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? "Cerrar asistente de ayuda" : "Abrir asistente de ayuda GenFeb"}
        title="Ayuda GenFeb"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full shadow-xl ring-2 ring-secondary/30 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          open
            ? "bg-muted text-foreground ring-border"
            : "bg-secondary text-secondary-foreground hover:bg-secondary/90",
        )}
      >
        {open ? <X className="h-6 w-6" /> : <Bot className="h-6 w-6" />}
      </button>
    </div>,
    document.body,
  );
}
