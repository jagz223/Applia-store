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
  rideIdOverride?: string | null,
): number | null {
  const rideId = rideIdOverride ?? loadActiveGoRideId();
  if (!rideId) return null;
  const conv = findActiveMobilityRideConversation(conversations, rideId);
  return conv?.id ?? null;
}

/** El hilo pertenece al viaje Go activo (no un chat genérico ni otro viaje). */
export function conversationBelongsToGoRide(
  conv: ConversationEnriched | undefined,
  rideId: string | null,
): boolean {
  if (!conv || !rideId) return false;
  return (
    String(conv.kind ?? "") === "mobility_ride" &&
    String(conv.mobilityRideId ?? "").trim() === String(rideId).trim() &&
    conv.messagesLocked !== true
  );
}

/** Obtiene el conversationId del viaje Go desde la API (conductor o pasajero). */
export async function fetchGoRideConversationId(
  rideId: string,
  module: "cargo" | "pack",
): Promise<number | null> {
  const token = localStorage.getItem("token");
  if (!token) return null;
  const base = module === "pack" ? "/api/pack/rides" : "/api/mobility/rides";
  try {
    const res = await fetch(`${base}/${encodeURIComponent(rideId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const ride = (await res.json()) as { conversationId?: number | null };
    const cid = ride?.conversationId;
    if (cid == null || !Number.isFinite(Number(cid))) return null;
    return Number(cid);
  } catch {
    return null;
  }
}
