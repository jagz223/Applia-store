/**
 * Textos de interfaz para flujos taxi y delivery (pasajero y conductor).
 * Evita mostrar marcas internas tipo «Car Go» / «Pack Go» en la UI.
 */
export const MOBILITY_UI = {
  taxiService: "Servicio de taxi",
  delivery: "Delivery",
} as const;

export type MobilityGoSlug = "cargo" | "pack";

export function mobilityServiceLabel(goSlug: MobilityGoSlug | undefined): string {
  return goSlug === "pack" ? MOBILITY_UI.delivery : MOBILITY_UI.taxiService;
}

/** Subtítulo «Servicio de taxi · Delivery» para títulos de historial. */
export const MOBILITY_HISTORY_SUBTITLE = `${MOBILITY_UI.taxiService} · ${MOBILITY_UI.delivery}`;

export function mobilityHistorySheetTitle(): string {
  return `Historial de servicios (${MOBILITY_HISTORY_SUBTITLE})`;
}
