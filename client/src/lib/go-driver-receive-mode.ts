import type { GoDriverReceiveMode } from "@/lib/taxi-driver-storage";

export type { GoDriverReceiveMode };

export function isReceivingTaxiMode(mode: GoDriverReceiveMode): boolean {
  return mode === "taxi" || mode === "both";
}

export function isReceivingDeliveryMode(mode: GoDriverReceiveMode): boolean {
  return mode === "delivery" || mode === "both";
}

export function isReceivingAnyGoMode(mode: GoDriverReceiveMode): boolean {
  return mode !== "off";
}

export function receiveModeToGoSlug(mode: GoDriverReceiveMode): "taxi" | "pack" {
  return mode === "delivery" ? "pack" : "taxi";
}

export function goSlugToReceiveMode(slug: "taxi" | "pack"): GoDriverReceiveMode {
  return slug === "pack" ? "delivery" : "taxi";
}
