/**
 * Capacidades reales de la «burbuja» del conductor según plataforma.
 *
 * En Android (Chrome, PWA o TWA/Bubblewrap `com.genfeb.www.twa`):
 * - Document Picture-in-Picture NO está implementado en Chromium móvil.
 * - No se puede pedir «mostrar encima de otras apps» desde JavaScript.
 * - Una burbuja tipo Messenger requiere código nativo en el APK (Foreground Service,
 *   notificación persistente o Bubble API de Android).
 *
 * En escritorio Chrome sí puede usarse documentPictureInPicture (limitado).
 */

export function isAndroidMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /Android/i.test(ua) && !/Tablet/i.test(ua);
}

export function isInstalledWebApp(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** App instalada (PWA o TWA Bubblewrap) en Android. */
export function isAndroidInstalledWebApp(): boolean {
  return isAndroidMobile() && isInstalledWebApp();
}

/**
 * Burbuja flotante del sistema (PiP HTML o overlay nativo).
 * Falso en Android: la web no puede minimizar la app ni flotar encima de otras.
 */
export function isDriverBubbleOverlaySupported(): boolean {
  if (typeof window === "undefined") return false;
  if (isAndroidMobile()) return false;
  return "documentPictureInPicture" in window;
}

/** Auto-minimizar al pulsar Inicio / cambiar de app (solo donde hay overlay web). */
export function shouldAutoMinimizeDriverBubbleOnHide(): boolean {
  return isDriverBubbleOverlaySupported();
}
