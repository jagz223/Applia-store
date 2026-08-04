/**
 * Banderas de producto: ocultar UI sin borrar código; desactivar ramas de negocio relacionadas.
 * Reactivar: poner a `true` lo que corresponda.
 */

/** Saldo Applia, recargas, historial de movimientos y opción de pago con saldo en flujos públicos. */
export const FEATURE_WALLET_RECHARGE_UI_ENABLED = false;

/**
 * Comisión de plataforma en pagos fuera de la app (efectivo / transferencia bancaria):
 * liquidación en servidor y textos en UI (incluye desglose neto/comisión en paneles si aplica).
 */
export const FEATURE_OFF_PLATFORM_COMMISSION_ENABLED = false;

/** Precio mostrado en catálogo y coste inicial de reserva siempre 0 (sin cobro por la app). */
export const FEATURE_SERVICE_PRICE_ALWAYS_ZERO = true;
