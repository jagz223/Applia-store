import { useCallback } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { QUERY_KEYS } from "@/hooks/use-chat";

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function requestSupportConversation(): Promise<number> {
  const res = await fetch("/api/support/conversation", {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message ?? "No se pudo abrir el chat de ayuda");
  }
  const data = (await res.json()) as { conversationId?: number };
  const id = Number(data.conversationId);
  if (!Number.isFinite(id) || id <= 0) throw new Error("Respuesta inválida del servidor");
  return id;
}

export function useOpenSupportHelpChat() {
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  return useCallback(async () => {
    if (!isAuthenticated) {
      const returnTo = encodeURIComponent("/chat?support=1");
      setLocation(`/auth/login?return=${returnTo}`);
      return;
    }
    const conversationId = await requestSupportConversation();
    await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.conversations });
    setLocation(`/chat?conversation=${conversationId}`, { replace: false });
  }, [isAuthenticated, queryClient, setLocation]);
}

export function useCloseSupportConversation() {
  const queryClient = useQueryClient();

  return useCallback(async (conversationId: number) => {
    const res = await fetch(`/api/support/conversations/${conversationId}/close`, {
      method: "POST",
      headers: authHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { message?: string }).message ?? "No se pudo cerrar la consulta");
    }
    await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.conversations });
    await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.messages(conversationId) });
  }, [queryClient]);
}
