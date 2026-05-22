import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import { isLeafletMapContainerLive, safeInvalidateSize } from "@/lib/safe-leaflet";

/**
 * Leaflet calcula el tamaño del lienzo en el primer frame; tras recargar el servidor / Vite o cuando el
 * layout aún no fijó el alto del padre, el mapa queda colapsado. ResizeObserver + invalidateSize escalonado lo corrige.
 */
export function LeafletMapLayoutFix() {
  const map = useMap();
  const timeoutsRef = useRef<number[]>([]);

  useEffect(() => {
    let alive = true;
    if (!isLeafletMapContainerLive(map)) return;
    const el = map.getContainer();

    const run = () => {
      if (!alive) return;
      safeInvalidateSize(map);
    };

    const scheduleDelays = () => {
      timeoutsRef.current.forEach((id) => window.clearTimeout(id));
      timeoutsRef.current = [];
      const delays = [0, 40, 100, 200, 400, 800, 1600];
      delays.forEach((ms) => {
        timeoutsRef.current.push(window.setTimeout(run, ms));
      });
    };

    requestAnimationFrame(run);
    scheduleDelays();

    const onWindowLoad = () => run();
    if (document.readyState === "complete") {
      requestAnimationFrame(run);
    } else {
      window.addEventListener("load", onWindowLoad);
    }

    const onResize = () => requestAnimationFrame(run);
    window.addEventListener("resize", onResize);

    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) scheduleDelays();
    };
    window.addEventListener("pageshow", onPageShow);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => requestAnimationFrame(run));
      ro.observe(el);
      if (el.parentElement) ro.observe(el.parentElement);
    }

    let cancelled = false;
    if (document.fonts?.ready) {
      void document.fonts.ready.then(() => {
        if (!cancelled) requestAnimationFrame(run);
      });
    }

    return () => {
      alive = false;
      cancelled = true;
      timeoutsRef.current.forEach((id) => window.clearTimeout(id));
      timeoutsRef.current = [];
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("load", onWindowLoad);
      ro?.disconnect();
    };
  }, [map]);

  return null;
}
