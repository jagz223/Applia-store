/**
 * Capa de API del chat (Dependency Inversion).
 * Centraliza todas las llamadas HTTP del chat y el uso del token.
 */

import type { ConversationEnriched, Message, SendMessageInput, CreateConversationInput } from "@/types/chat";

const BASE = "";

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
      ...options.headers,
    },
  });
  if (res.status === 401) {
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message ?? "Error en la solicitud");
  }
  return res.json();
}

export const chatApi = {
  getConversations(): Promise<ConversationEnriched[]> {
    return fetchJson<ConversationEnriched[]>(`${BASE}/api/conversations`);
  },

  getMessages(conversationId: number): Promise<Message[]> {
    return fetchJson<Message[]>(`${BASE}/api/conversations/${conversationId}/messages`);
  },

  createConversation(input: CreateConversationInput): Promise<{ id: number }> {
    return fetchJson(`${BASE}/api/conversations`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  sendMessage(input: SendMessageInput): Promise<Message> {
    return fetchJson<Message>(`${BASE}/api/messages`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  markConversationAsRead(conversationId: number): Promise<void> {
    return fetchJson<void>(`${BASE}/api/conversations/${conversationId}/read`, {
      method: "PATCH",
    });
  },
};
