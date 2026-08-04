import { useEffect, useRef } from "react";
import { useMap, useMapEvents } from "react-leaflet";
import {
  isLeafletMapContainerLive,
  safeInvalidateSize,
  safeStopLeafletMap,
} from "@/lib/safe-leaflet";

const DEBOUNCE_MS = 350;
const BOOTSTRAP_DELAYS_MS = [0, 80, 200, 400];

/**
 * Leaflet calcula el tamaño del lienzo en el primer frame; tras recargar o cuando el
 * layout aún no fijó el alto del padre, el mapa queda colapsado.
 * Debounce + pausa durante pan/zoom evita “cuadros blancos” en móvil.
 */
export function LeafletMapLayoutFix() {
  const map = useMap();
  const timeoutsRef = useRef<number[]>([]);
  const debounceRef = useRef<number | null>(null);
  const bootstrappedRef = useRef(false);
  const interactingRef = useRef(false);

  useMapEvents({
    dragstart: () => {
      interactingRef.current = true;
    },
    dragend: () => {
      interactingRef.current = false;
    },
    zoomstart: () => {
      interactingRef.current = true;
    },
    zoomend: () => {
      interactingRef.current = false;
    },
  });

  useEffect(() => {
    let alive = true;
    if (!isLeafletMapContainerLive(map)) return;
    const el = map.getContainer();

    const runInvalidate = () => {
      if (!alive || interactingRef.current) return;
      if (!isLeafletMapContainerLive(map)) return;
      safeInvalidateSize(map);
    };

    const scheduleDebounced = () => {
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        debounceRef.current = null;
        runInvalidate();
      }, DEBOUNCE_MS);
    };

    const scheduleBootstrap = () => {
      timeoutsRef.current.forEach((id) => window.clearTimeout(id));
      timeoutsRef.current = [];
      BOOTSTRAP_DELAYS_MS.forEach((ms) => {
        timeoutsRef.current.push(
          window.setTimeout(() => {
            if (!alive || interactingRef.current) return;
            runInvalidate();
          }, ms),
        );
      });
    };

    if (!bootstrappedRef.current) {
      bootstrappedRef.current = true;
      scheduleBootstrap();
    }

    const onResize = () => scheduleDebounced();
    window.addEventListener("resize", onResize);

    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) scheduleBootstrap();
    };
    window.addEventListener("pageshow", onPageShow);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && el?.isConnected) {
      ro = new ResizeObserver(() => scheduleDebounced());
      ro.observe(el);
    }

    return () => {
      alive = false;
      safeStopLeafletMap(map);
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
      timeoutsRef.current.forEach((id) => window.clearTimeout(id));
      timeoutsRef.current = [];
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pageshow", onPageShow);
      ro?.disconnect();
    };
  }, [map]);

  return null;
}
