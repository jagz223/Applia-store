/**
 * Banderas de producto: ocultar UI sin borrar código; desactivar ramas de negocio relacionadas.
 * Reactivar: poner a `true` lo que corresponda.
 */

/** Saldo GenFeb, recargas, historial de movimientos y opción de pago con saldo en flujos públicos. */
export const FEATURE_WALLET_RECHARGE_UI_ENABLED = false;

/**
 * Comisión de plataforma en pagos fuera de la app (efectivo / transferencia bancaria):
 * liquidación en servidor y textos en UI (incluye desglose neto/comisión en paneles si aplica).
 */
export const FEATURE_OFF_PLATFORM_COMMISSION_ENABLED = false;
