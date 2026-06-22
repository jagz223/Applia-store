import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { useGoDriverBubble } from "@/contexts/GoDriverBubbleContext";
import { isDriverBubbleMainPath } from "@/lib/go-driver-bubble-mode";

/**
 * Capa sobre el mapa cuando la burbuja está activa en la pestaña (sin PiP).
 * Evita la pantalla blanca vacía y deja el mapa montado debajo.
 */
export function DriverBubbleScreenOverlay() {
  const [location] = useLocation();
  const { active, overlaySupported, shellCollapsed, pipActive, expand } = useGoDriverBubble();

  if (!active || !overlaySupported || !shellCollapsed || pipActive || !isDriverBubbleMainPath(location)) return null;

  return createPortal(
    <button
      type="button"
      className="fixed inset-0 z-[78] touch-none bg-background/88 backdrop-blur-[3px] lg:hidden"
      aria-label="Panel conductor minimizado. Toca para expandir."
      onClick={() => expand()}
    />,
    document.body,
  );
}
