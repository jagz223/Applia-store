import { useLayoutEffect, useRef, useState } from "react";

export type DeferredLeafletMountOptions = {
  /** Si el rect del shell alcanza esta altura (px), montamos el mapa. */
  minShellHeightPx?: number;
  /** Tras este tiempo montamos igual (evita mapa en blanco eterno). */
  maxWaitMs?: number;
  /** Pequeña espera para que el navegador aplique CSS del shell antes de medir. */
  minDelayMs?: number;
};

/**
 * Leaflet inicializa el tamaño del lienzo en el primer frame; si el padre aún no tiene alto
 * (orden de hojas de estilo, flex, tabs, etc.), el mapa queda colapsado hasta un HMR.
 * Esperamos a medir altura real en el shell antes de montar `MapContainer`.
 */
export function useDeferredLeafletMount(options: DeferredLeafletMountOptions = {}) {
  const { minShellHeightPx = 40, maxWaitMs = 2000, minDelayMs = 32 } = options;
  const shellRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    let cancelled = false;
    const markReady = () => {
      if (!cancelled) setReady(true);
    };

    const shellTallEnough = () => {
      const el = shellRef.current;
      if (!el) return false;
      return el.getBoundingClientRect().height >= minShellHeightPx;
    };

    const tick = () => {
      if (cancelled) return;
      if (shellTallEnough()) markReady();
    };

    const minDelayId = window.setTimeout(tick, minDelayMs);
    const maxWaitId = window.setTimeout(markReady, maxWaitMs);

    const shell = shellRef.current;
    let ro: ResizeObserver | null = null;
    if (shell && typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => tick());
      ro.observe(shell);
    }

    const rafOuter = requestAnimationFrame(() => {
      tick();
      requestAnimationFrame(tick);
    });

    tick();

    return () => {
      cancelled = true;
      setReady(false);
      window.clearTimeout(minDelayId);
      window.clearTimeout(maxWaitId);
      ro?.disconnect();
      cancelAnimationFrame(rafOuter);
    };
  }, [minShellHeightPx, maxWaitMs, minDelayMs]);

  return { shellRef, ready };
}
