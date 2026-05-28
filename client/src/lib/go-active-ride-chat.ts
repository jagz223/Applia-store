import { loadGoDriverActiveRideId } from "@/lib/cargo-driver-storage";
import { loadGoRiderActiveRideId } from "@/lib/cargo-rider-storage";
import { findActiveMobilityRideConversation } from "@shared/chat-conversation-scope";
import type { ConversationEnriched } from "@/types/chat";

/** Id del viaje Go activo en este dispositivo (conductor o pasajero). */
export function loadActiveGoRideId(): string | null {
  return loadGoDriverActiveRideId("cargo") ?? loadGoDriverActiveRideId("pack") ?? loadGoRiderActiveRideId("cargo") ?? loadGoRiderActiveRideId("pack");
}

/** Conversación del viaje en curso (no cerrada), si existe en la lista. */
export function activeGoRideConversationId(
  conversations: readonly ConversationEnriched[],
): number | null {
  const rideId = loadActiveGoRideId();
  if (!rideId) return null;
  const conv = findActiveMobilityRideConversation(conversations, rideId);
  return conv?.id ?? null;
}
