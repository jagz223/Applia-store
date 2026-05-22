/** Avisar a la UI que el historial persistido en servidor cambió. */
export function notifyMobilityRideHistoryChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("mobility-ride-history-changed"));
}
