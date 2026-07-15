import { FormEvent, useEffect, useRef } from "react";
import { Bot, Loader2, MessageCircle, RotateCcw, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { HelpAiChatMessage } from "@/hooks/use-help-ai-chat";
import { useOpenSupportHelpChat } from "@/hooks/use-support-chat";
import { useToast } from "@/hooks/use-toast";

type HelpAiChatPanelProps = {
  open: boolean;
  onClose: () => void;
  messages: HelpAiChatMessage[];
  loading: boolean;
  onSend: (text: string) => Promise<void>;
  onReset: () => void;
};

export function HelpAiChatPanel({
  open,
  onClose,
  messages,
  loading,
  onSend,
  onReset,
}: HelpAiChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const openSupportChat = useOpenSupportHelpChat();
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    const viewport = scrollRef.current?.querySelector("[data-radix-scroll-area-viewport]");
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [messages, loading, open]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = inputRef.current?.value ?? "";
    if (!value.trim()) return;
    if (inputRef.current) inputRef.current.value = "";
    await onSend(value);
  }

  async function handleHumanSupport() {
    try {
      onClose();
      await openSupportChat();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "No se pudo abrir el chat de soporte",
        description: err instanceof Error ? err.message : "Error desconocido",
      });
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="Asistente de ayuda GenFeb"
      className="pointer-events-auto mb-3 flex h-[min(32rem,calc(100dvh-6rem))] w-[min(24rem,calc(100vw-3rem))] flex-col overflow-hidden rounded-2xl border border-border/70 bg-background shadow-2xl ring-1 ring-black/5 animate-in fade-in-0 slide-in-from-bottom-4 duration-200"
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-border/60 bg-primary px-4 py-3 text-primary-foreground">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-foreground/15">
          <Bot className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">Asistente GenFeb</p>
          <p className="truncate text-xs text-primary-foreground/80">Dudas sobre la plataforma</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
          onClick={onReset}
          title="Reiniciar conversación"
        >
          <RotateCcw className="h-4 w-4" />
          <span className="sr-only">Reiniciar conversación</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Cerrar asistente</span>
        </Button>
      </header>

      <ScrollArea ref={scrollRef} className="min-h-0 flex-1 px-3 py-3">
        <ul className="flex flex-col gap-3">
          {messages.map((message) => (
            <li
              key={message.id}
              className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[92%] rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-sm",
                  message.role === "user"
                    ? "rounded-br-md bg-secondary text-secondary-foreground"
                    : "rounded-bl-md border border-border/50 bg-muted/40 text-foreground",
                )}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
                {message.role === "assistant" && message.suggestHumanSupport ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2 h-8 gap-1.5 text-xs"
                    onClick={() => void handleHumanSupport()}
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    Hablar con un asesor
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
          {loading ? (
            <li className="flex justify-start">
              <div className="inline-flex items-center gap-2 rounded-2xl rounded-bl-md border border-border/50 bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Escribiendo…
              </div>
            </li>
          ) : null}
        </ul>
      </ScrollArea>

      <footer className="shrink-0 border-t border-border/60 bg-background p-3">
        <form onSubmit={(e) => void handleSubmit(e)} className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            name="message"
            autoComplete="off"
            placeholder="Ej: ¿Cómo me registro como Car Go?"
            disabled={loading}
            maxLength={2000}
            className="h-10 min-w-0 flex-1 rounded-full border border-input bg-background px-4 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button type="submit" size="icon" className="h-10 w-10 shrink-0 rounded-full" disabled={loading}>
            <Send className="h-4 w-4" />
            <span className="sr-only">Enviar</span>
          </Button>
        </form>
      </footer>
    </div>
  );
}
