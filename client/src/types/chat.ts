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
  /** Reserva vinculada (chat de servicio marketplace). */
  bookingId?: number | null;
  /** p. ej. `service_booking` para conversaciones vinculadas a una reserva. */
  kind?: string | null;
  /** Cuando la reserva pasó a completada/cancelada (ISO). */
  serviceEndedAt?: string | null;
  /** Tras esta fecha/hora la conversación ya no aparece para usuarios normales (ISO). Los admins siguen viendo el historial en auditoría. */
  serviceChatHideFromUsersAt?: string | null;
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
  type?: "text" | "image" | "file" | "location" | "system";
}

export interface CreateConversationInput {
  participantId: string;
  serviceId?: number;
}
