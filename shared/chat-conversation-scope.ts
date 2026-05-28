/**
 * Reglas para reutilizar o crear conversaciones: cada servicio (viaje, reserva) debe tener su propio hilo.
 */

export type ConversationScopeRow = {
  id?: number;
  participant1Id?: string;
  participant2Id?: string;
  otherParticipant?: { id?: string };
  bookingId?: number | string | null;
  kind?: string | null;
  mobilityRideId?: string | null;
  messagesLocked?: boolean;
};

export type ConversationMatchScope = {
  participantId: string;
  bookingId?: number;
  mobilityRideId?: string;
};

function matchesPeer(c: ConversationScopeRow, participantId: string): boolean {
  const pid = String(participantId ?? "").trim();
  if (!pid) return false;
  return (
    c.otherParticipant?.id === pid ||
    c.participant1Id === pid ||
    c.participant2Id === pid
  );
}

function isServiceScopedConversation(c: ConversationScopeRow): boolean {
  const kind = String(c.kind ?? "").trim();
  if (kind === "mobility_ride" || kind === "service_booking") return true;
  if (c.bookingId != null && String(c.bookingId).trim() !== "") return true;
  if (c.mobilityRideId != null && String(c.mobilityRideId).trim() !== "") return true;
  return false;
}

/**
 * Busca un hilo existente solo si coincide el ámbito del servicio (reserva o viaje).
 * Sin bookingId ni mobilityRideId no reutiliza hilos de servicios anteriores con el mismo usuario.
 */
export function findConversationForServiceScope<T extends ConversationScopeRow>(
  list: readonly T[],
  scope: ConversationMatchScope,
): T | undefined {
  const participantId = String(scope.participantId ?? "").trim();
  if (!participantId) return undefined;

  if (scope.mobilityRideId != null && String(scope.mobilityRideId).trim() !== "") {
    const rideId = String(scope.mobilityRideId).trim();
    return list.find(
      (c) => matchesPeer(c, participantId) && String(c.mobilityRideId ?? "").trim() === rideId,
    );
  }

  if (scope.bookingId != null && Number.isFinite(scope.bookingId)) {
    const bid = Number(scope.bookingId);
    return list.find(
      (c) => matchesPeer(c, participantId) && Number(c.bookingId) === bid,
    );
  }

  return list.find((c) => matchesPeer(c, participantId) && !isServiceScopedConversation(c));
}

/** Hilo activo de un viaje Go (matched / in_progress, no cerrado). */
export function findActiveMobilityRideConversation<T extends ConversationScopeRow>(
  list: readonly T[],
  rideId: string,
): T | undefined {
  const id = String(rideId ?? "").trim();
  if (!id) return undefined;
  return list.find(
    (c) =>
      String(c.kind ?? "") === "mobility_ride" &&
      String(c.mobilityRideId ?? "").trim() === id &&
      c.messagesLocked !== true,
  );
}
