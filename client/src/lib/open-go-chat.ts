import {
  GO_CHAT_QUERY_PARAM,
  buildDesktopChatPath,
  isGoMobilityShellPath,
} from "@shared/chat-notification-open";

export { GO_CHAT_QUERY_PARAM, isGoMobilityShellPath };

export const GO_OPEN_CHAT_EVENT = "genfeb:open-go-chat";

export function dispatchOpenGoChat(conversationId: number): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(GO_OPEN_CHAT_EVENT, { detail: { conversationId } }),
  );
}

/** Quita `goChat` de la URL sin recargar (replaceState). */
export function stripGoChatQueryParam(): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  if (!params.has(GO_CHAT_QUERY_PARAM)) return;
  params.delete(GO_CHAT_QUERY_PARAM);
  const qs = params.toString();
  const next = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
  window.history.replaceState(null, "", next);
}

export function parseGoChatConversationId(search: string): number | null {
  const raw = new URLSearchParams(search).get(GO_CHAT_QUERY_PARAM);
  if (raw == null || raw.trim() === "") return null;
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/**
 * Abre chat embebido en Go si la ruta actual es del shell Go; si no, navega a /chat.
 */
export function openChatFromNotification(opts: {
  conversationId: number | string;
  pathname?: string;
  setLocation: (path: string) => void;
  openChatWithConversation?: (id: number) => void;
  closeNotifications?: () => void;
}): void {
  const id = Number(opts.conversationId);
  if (!Number.isFinite(id) || id <= 0) return;

  opts.closeNotifications?.();

  const pathname =
    opts.pathname ??
    (typeof window !== "undefined" ? window.location.pathname : "");

  if (isGoMobilityShellPath(pathname)) {
    stripGoChatQueryParam();
    if (opts.openChatWithConversation) {
      opts.openChatWithConversation(id);
    } else {
      dispatchOpenGoChat(id);
    }
    return;
  }

  opts.setLocation(buildDesktopChatPath(id));
}
