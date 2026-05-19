import { useEffect, useState } from "react";
import { promotionalCodesNeedLiveExpiryClock, type PromotionalCodeRecord } from "@shared/promotional-code-utils";

const TICK_MS = 10_000;

/**
 * Reloj local para la columna «Vence en» de códigos promocionales.
 * Solo hace tick cada 10 s si la pestaña está activa, el documento es visible
 * y hay al menos un código por tiempo con menos de 24 h restantes (sin llamadas al servidor).
 */
export function usePromotionalExpiryClock(active: boolean, codes: readonly PromotionalCodeRecord[]) {
  const [now, setNow] = useState(() => Date.now());

  const needsTick = active && promotionalCodesNeedLiveExpiryClock(codes, now);

  useEffect(() => {
    if (!needsTick) return;

    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      setNow(Date.now());
    };

    tick();

    const intervalId = window.setInterval(tick, TICK_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [needsTick]);

  return now;
}
