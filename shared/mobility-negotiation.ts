/** Ventana de ofertas de regateo (pasajero buscando / conductores ofertando), alineada con el servidor. */
export const GO_NEGOTIATION_OFFER_WINDOW_MS = 5 * 60 * 1000;

/** Intervalo recomendado para refrescar el tablero de regateo en el cliente. */
export const GO_NEGOTIATION_BOARD_POLL_MS = 5000;

/** Polling de ofertas clásicas (modal aceptar/rechazar) — mismo enfoque HTTP que regateo. */
export const GO_CLASSIC_OFFER_POLL_MS = 5000;

/** Respuesta HTTP / UI cuando el conductor intenta enviar otra oferta al mismo viaje. */
export const DRIVER_NEGOTIATION_OFFER_ALREADY_SENT_MESSAGE =
  "Ya enviaste una propuesta para este viaje. Esperá la respuesta del cliente.";

/** Pasajero: POST accept cuando el conductor ya tiene otro servicio activo (taxi o delivery). */
export const RIDER_DRIVER_NOT_AVAILABLE_MESSAGE =
  "Ese conductor ya no está disponible (puede estar en otro servicio). Elegí otra oferta.";

/** Payload socket `negotiation:offer_removed` → conductor: el cliente descartó solo tu oferta. */
export const NEGOTIATION_OFFER_REMOVED_REASON_RIDER_REJECTED = "rider_rejected";

/**
 * Payload socket `negotiation:offer_removed` → conductor: se retiraron tus ofertas en otros viajes
 * porque aceptaste otro servicio (normal o regateo).
 */
export const NEGOTIATION_OFFER_REMOVED_REASON_WITHDRAWN = "withdrawn_other_service";
