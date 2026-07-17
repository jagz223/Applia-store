import { useCallback, useState } from "react";
import type { HelpChatAskResponse, HelpChatHistoryEntry } from "@shared/help-chat";

export type HelpAiChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  suggestHumanSupport?: boolean;
};

function nextMessageId(): string {
  return `help-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

async function postHelpAsk(
  message: string,
  history: HelpChatHistoryEntry[],
): Promise<HelpChatAskResponse> {
  const res = await fetch("/api/help/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history }),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(err.message ?? "No se pudo obtener respuesta de ayuda");
  }

  return res.json() as Promise<HelpChatAskResponse>;
}

export function useHelpAiChat() {
  const [messages, setMessages] = useState<HelpAiChatMessage[]>(() => [
    {
      id: "welcome",
      role: "assistant",
      content:
        "Hola, soy el asistente de ayuda de GenFeb. Pregúntame cómo registrarte, reservar un servicio, usar GenFeb Go o gestionar tu cuenta.",
    },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(async (rawText: string) => {
    const text = rawText.trim();
    if (!text || loading) return;

    const userMessage: HelpAiChatMessage = {
      id: nextMessageId(),
      role: "user",
      content: text,
    };

    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);
    setError(null);

    const history: HelpChatHistoryEntry[] = [...messages, userMessage]
      .filter((m) => m.id !== "welcome")
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      const response = await postHelpAsk(text, history);
      const assistantMessage: HelpAiChatMessage = {
        id: nextMessageId(),
        role: "assistant",
        content: response.reply,
        suggestHumanSupport: response.suggestHumanSupport,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Error desconocido";
      setError(message);
      setMessages((prev) => [
        ...prev,
        {
          id: nextMessageId(),
          role: "assistant",
          content: "Hubo un problema al procesar tu consulta. Intenta de nuevo o habla con un asesor.",
          suggestHumanSupport: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [loading, messages]);

  const resetChat = useCallback(() => {
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content:
          "Hola, soy el asistente de ayuda de GenFeb. Pregúntame cómo registrarte, reservar un servicio, usar GenFeb Go o gestionar tu cuenta.",
      },
    ]);
    setError(null);
  }, []);

  return { messages, loading, error, sendMessage, resetChat };
}
