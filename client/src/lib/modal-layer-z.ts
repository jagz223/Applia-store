/**
 * Capas de modales (Radix portales). Los AlertDialog deben quedar por encima de Dialog
 * (p. ej. mapas usan z-[50000]); si no, el overlay del Dialog tapa el contenido del alert.
 */
export const MODAL_Z_DIALOG_OVERLAY = "z-[50000]";
export const MODAL_Z_DIALOG_CONTENT = "z-[50001]";
export const MODAL_Z_ALERT_OVERLAY = "z-[50100]";
export const MODAL_Z_ALERT_CONTENT = "z-[50101]";
/** Select, tooltip, popover dentro de modales */
export const MODAL_Z_POPOVER = "z-[51000]";
