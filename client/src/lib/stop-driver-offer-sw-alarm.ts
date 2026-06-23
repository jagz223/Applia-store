/** Detiene el recordatorio sonoro/vibración de oferta en el Service Worker (APK/TWA en segundo plano). */
export function stopDriverOfferSwAlarm(rideId: string | null | undefined): void {
  if (typeof navigator === "undefined" || !rideId?.trim()) return;
  if (!("serviceWorker" in navigator)) return;
  void navigator.serviceWorker.ready
    .then((reg) => {
      reg.active?.postMessage({ type: "STOP_OFFER_ALARM", rideId: String(rideId).trim() });
    })
    .catch(() => {
      /* ignore */
    });
}
