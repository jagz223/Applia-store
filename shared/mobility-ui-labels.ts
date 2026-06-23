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

/** Textos del panel y modales del conductor con servicio activo (taxi vs delivery). */
export function driverServiceCopy(goSlug: MobilityGoSlug) {
  if (goSlug === "pack") {
    return {
      panelPickup: "Ir a recoger paquete",
      panelSearching: "Recogiendo paquete",
      panelInProgress: "Entrega en curso",
      startSearchButton: "Buscar paquete",
      startSearchTitle: "¿Buscar el paquete?",
      startSearchDescription:
        "Al confirmar, indicaremos que vas al punto de recogida del envío. Luego podrás iniciar la entrega cuando tengas el paquete.",
      startSearchConfirm: "Sí, buscar paquete",
      startRideButton: "Iniciar entrega",
      startRideTitle: "¿Ya recogiste el paquete?",
      startRideDescription:
        "Al confirmar, la entrega iniciará oficialmente y se actualizará para ti y el cliente.",
      cancelButton: "Cancelar envío",
      cancelTitleActive: "¿Cancelar el envío en curso?",
      cancelTitlePending: "¿Cancelar este envío?",
      cancelDescActive:
        "Si ya vas en ruta, avisa al cliente por teléfono o chat. El envío quedará anulado para ambos.",
      cancelDescPending:
        "El cliente verá que cancelaste antes de recoger el paquete. ¿Seguro que deseas continuar?",
      cancelledToastTitle: "Envío cancelado",
    } as const;
  }
  return {
    panelPickup: "En servicio",
    panelSearching: "Buscando pasajero",
    panelInProgress: "Viaje en curso",
    startSearchButton: "Iniciar búsqueda",
    startSearchTitle: "¿Iniciar búsqueda del pasajero?",
    startSearchDescription:
      "Al confirmar, comenzaremos a coordinar la recogida. Luego podrás iniciar el viaje cuando ya estés con él.",
    startSearchConfirm: "Sí, iniciar búsqueda",
    startRideButton: "Iniciar viaje",
    startRideTitle: "¿Ya recogiste al pasajero?",
    startRideDescription:
      "Al confirmar, el viaje iniciará oficialmente y se actualizará para ambos.",
    cancelButton: "Cancelar viaje",
    cancelTitleActive: "¿Cancelar el viaje en curso?",
    cancelTitlePending: "¿Cancelar este viaje?",
    cancelDescActive:
      "Si ya van en ruta, avisa al pasajero por teléfono o chat. El viaje quedará anulado para ambos.",
    cancelDescPending:
      "El pasajero verá que cancelaste antes de iniciar. ¿Seguro que deseas continuar?",
    cancelledToastTitle: "Viaje cancelado",
  } as const;
}

export function driverServicePanelHeading(
  goSlug: MobilityGoSlug,
  phase: "pickup" | "searching" | "in_progress",
): string {
  const copy = driverServiceCopy(goSlug);
  if (phase === "in_progress") return copy.panelInProgress;
  if (phase === "searching") return copy.panelSearching;
  return copy.panelPickup;
}
