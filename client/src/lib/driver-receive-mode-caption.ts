import type { GoDriverReceiveMode } from "@/lib/cargo-driver-storage";
import { MOBILITY_UI } from "@shared/mobility-ui-labels";

export type ReceiveModeCaptionTone = "off" | "taxi" | "delivery" | "both";

export function receiveModeCaptionTone(mode: GoDriverReceiveMode): ReceiveModeCaptionTone {
  if (mode === "taxi") return "taxi";
  if (mode === "delivery") return "delivery";
  if (mode === "both") return "both";
  return "off";
}

/** Texto largo solo con el control apagado (cómo activar taxi, delivery o híbrido). */
export function receiveModeOffGuideText(canTaxi: boolean, canDelivery: boolean): string {
  if (canTaxi && canDelivery) {
    return `Izquierda: taxi · derecha: ${MOBILITY_UI.delivery} · centro: apagar. Toque rápido en el botón: modo híbrido.`;
  }
  if (canTaxi) {
    return "Desliza a la izquierda para taxi; al centro para apagar.";
  }
  if (canDelivery) {
    return `Desliza a la derecha para ${MOBILITY_UI.delivery}; al centro para apagar.`;
  }
  return "Completa tu perfil y vehículo para activar un modo de trabajo.";
}

/** Hint mínimo solo en modo híbrido (cómo apagarlo). */
export function receiveModeHybridHintText(): string {
  return "Modo híbrido · toca el botón para apagar o desliza a taxi o delivery";
}

/** @deprecated Usar receiveModeOffGuideText / receiveModeHybridHintText según el modo. */
export function receiveModeCaptionText(
  mode: GoDriverReceiveMode,
  canTaxi: boolean,
  canDelivery: boolean,
): string {
  if (mode === "both") return receiveModeHybridHintText();
  if (mode === "taxi" || mode === "delivery") return "";
  return receiveModeOffGuideText(canTaxi, canDelivery);
}

export function receiveModeShowsCaption(mode: GoDriverReceiveMode, disabled: boolean): boolean {
  if (disabled) return true;
  return mode === "off" || mode === "both";
}

export function receiveModeCaptionIsCompact(mode: GoDriverReceiveMode, disabled: boolean): boolean {
  return !disabled && mode === "both";
}

export const RECEIVE_MODE_CAPTION_CLASS: Record<ReceiveModeCaptionTone, string> = {
  off: "text-muted-foreground",
  taxi: "text-sky-800 dark:text-sky-300",
  delivery: "text-violet-800 dark:text-violet-300",
  both:
    "bg-gradient-to-r from-sky-800 via-emerald-800 to-violet-800 bg-clip-text font-semibold text-transparent dark:from-sky-200 dark:via-emerald-100 dark:to-violet-200",
};

/** Texto flotante sobre el mapa (móvil): contraste alto en claro y oscuro. */
export const RECEIVE_MODE_MAP_CAPTION_CLASS: Record<ReceiveModeCaptionTone, string> = {
  off: "text-foreground/90 dark:text-white/95",
  taxi: "text-sky-900 dark:text-sky-200",
  delivery: "text-violet-900 dark:text-violet-200",
  both:
    "bg-gradient-to-r from-sky-900 via-emerald-900 to-violet-900 bg-clip-text font-semibold text-transparent dark:from-sky-100 dark:via-emerald-50 dark:to-violet-100",
};
