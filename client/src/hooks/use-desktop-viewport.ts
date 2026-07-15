import { useEffect, useState } from "react";

/** Alineado con Tailwind `lg:` (1024px): solo escritorio / web amplia. */
export const DESKTOP_MIN_WIDTH_PX = 1024;

/** true cuando el viewport es escritorio (≥1024px). */
export function useDesktopViewport(): boolean {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia(`(min-width: ${DESKTOP_MIN_WIDTH_PX}px)`).matches
      : false,
  );

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${DESKTOP_MIN_WIDTH_PX}px)`);
    const onChange = () => setIsDesktop(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return isDesktop;
}
