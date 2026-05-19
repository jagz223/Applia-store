import { cn } from "@/lib/utils";

/**
 * Clases que no deben pasarse en overlayClassName: el shell del portal controla
 * position y z-index para que el contenido quede siempre encima del backdrop.
 */
const OVERLAY_LAYOUT_CLASS =
  /\b(fixed|absolute|sticky|relative|inset-0|inset-x-0|inset-y-0|top-0|left-0|right-0|bottom-0|z-\[[^\]]+\]|z-\d+)\b/g;

/** Solo estilos visuales del fondo (opacidad, blur, animaciones data-state). */
export function sanitizeModalOverlayClassName(input?: string): string | undefined {
  if (!input?.trim()) return undefined;
  const cleaned = input.replace(OVERLAY_LAYOUT_CLASS, "").replace(/\s+/g, " ").trim();
  return cleaned || undefined;
}

export function mergeModalOverlayClassName(base: string, visual?: string): string {
  return cn(base, sanitizeModalOverlayClassName(visual));
}
