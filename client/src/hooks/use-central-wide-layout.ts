"use client";

import { useEffect, useState } from "react";
import { CENTRAL_COMPACT_MAX_WIDTH_PX } from "@/lib/central-viewport-layout";

/**
 * true = viewport ≥ breakpoint `lg` (misma lógica que `CentralDashboardDesktop` / `CentralDashboardMobile`).
 * Solo debe montarse un panel a la vez: Leaflet duplicado si Mobile y Desktop conviven en el árbol.
 */
export function useCentralWideLayout(): boolean {
  const query = `(min-width: ${CENTRAL_COMPACT_MAX_WIDTH_PX + 1}px)`;

  const [wide, setWide] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setWide(mq.matches);
    mq.addEventListener("change", onChange);
    setWide(mq.matches);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);

  return wide;
}
