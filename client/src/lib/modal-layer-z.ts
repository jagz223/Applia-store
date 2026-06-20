/**
 * Capas de modales (Radix portales). Valores altos para quedar por encima de:
 * - Leaflet (~1000), mapas embebidos, Home hero (glass-card / motion)
 * - Botones flotantes Go (`UI_Z_GO_FLOATING`, z-40), nav sticky / menú móvil (z-50)
 */

/** Botón/popover flotante hacia módulos Go (Home). Debajo del menú móvil (Sheet z-50). */
export const UI_Z_GO_FLOATING = "z-40";

/** Dialog legacy: overlay (hermano anterior al contenido). */
export const MODAL_Z_DIALOG_OVERLAY = "z-[2147482000]";

/** Dialog legacy: contenido centrado con position fixed (NO usar con relative). */
export const MODAL_Z_DIALOG_CONTENT = "z-[2147482001]";

/** Dialog con ModalPortalShell (visores admin, etc.). */
export const MODAL_Z_DIALOG_SHELL = MODAL_Z_DIALOG_OVERLAY;

/** Shell elevado por encima de otros dialogs. */
export const MODAL_Z_DIALOG_ELEVATED_SHELL = "z-[2147483200]";

/** AlertDialog con ModalPortalShell. */
export const MODAL_Z_ALERT_SHELL = "z-[2147483000]";

/**
 * Modales obligatorios (calificación post-servicio, etc.) por encima de `elevated`
 * (p. ej. detalle de orden en admin tienda).
 */
export const MODAL_Z_DIALOG_PRIORITY_SHELL = "z-[2147483400]";

/** Contenido dentro de ModalPortalShell (overlay absolute en el mismo shell). */
export const MODAL_CONTENT_ABOVE_OVERLAY = "relative z-10 pointer-events-auto";

/** Navbar / página: por encima de nav (z-50) y barras sticky (explore z-40). */
export const UI_Z_DROPDOWN = "z-[100]";

/** Select/combobox dentro de Dialog: por encima del contenido del modal. */
export const MODAL_Z_POPOVER = "z-[2147483300]";

/** @deprecated Usar MODAL_Z_ALERT_SHELL */
export const MODAL_Z_ALERT_OVERLAY = MODAL_Z_ALERT_SHELL;

/** @deprecated Usar MODAL_CONTENT_ABOVE_OVERLAY dentro del shell */
export const MODAL_Z_ALERT_CONTENT = MODAL_CONTENT_ABOVE_OVERLAY;
