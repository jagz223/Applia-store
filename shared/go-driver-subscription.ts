import { isVisibilitySubscriptionWindowActive } from "./professional-listing-subscription";

/** Mensaje API / toast cuando la suscripción de visibilidad no está vigente. */
export const GO_DRIVER_SUBSCRIPTION_INACTIVE_MESSAGE =
  "Tu suscripción no está activa. Renueva para recibir viajes y usar regateo.";

export const GO_DRIVER_SUBSCRIPTION_INACTIVE_SLIDE_HINT =
  "Renueva tu suscripción mensual para recibir viajes y envíos.";

/** Aviso en cabecera de la vista conductor (sin monto; el precio está en renovar suscripción). */
export const GO_DRIVER_SUBSCRIPTION_INACTIVE_DRIVER_BANNER =
  "Tu suscripción no está activa. Renueva para recibir viajes y envíos.";

export const GO_DRIVER_SUBSCRIPTION_INACTIVE_NEGOTIATION_HINT =
  "Renueva tu suscripción mensual para usar el tablero de regateo.";

/**
 * Conductor Go (taxi/delivery): puede operar si la ventana de suscripción de visibilidad está vigente.
 * `bypass` para admin de pruebas.
 */
export function isGoDriverSubscriptionActive(
  visibilitySubscriptionEndsAt: unknown,
  options?: { bypass?: boolean; nowMs?: number },
): boolean {
  if (options?.bypass) return true;
  return isVisibilitySubscriptionWindowActive(visibilitySubscriptionEndsAt, options?.nowMs);
}
