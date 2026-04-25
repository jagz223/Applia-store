/**
 * Tipos del dominio de chat.
 * Responsabilidad única: definir contratos de datos para conversaciones y mensajes.
 */

export interface ChatParticipant {
  id: string;
  name: string;
  lastName: string;
  profileImageUrl?: string | null;
  isDeleted?: boolean;
}

export interface ConversationEnriched {
  id: number;
  participant1Id: string;
  participant2Id: string;
  serviceId?: number;
  lastMessageAt: string | Date | null;
  createdAt: string | Date | null;
  otherParticipant: ChatParticipant;
  lastMessageText: string | null;
  unreadCount: number;
}

export interface Message {
  id: number;
  conversationId: number;
  senderId: string;
  content: string;
  type?: string;
  status?: string;
  readAt?: string | Date | null;
  createdAt: string | Date;
}

/** Respuesta paginada de mensajes (más viejos primero en `messages`). */
export interface MessagesPage {
  messages: Message[];
  hasMore: boolean;
}

export interface SendMessageInput {
  conversationId: number;
  content: string;
  type?: "text" | "image" | "file" | "location";
}

export interface CreateConversationInput {
  participantId: string;
  serviceId?: number;
}
