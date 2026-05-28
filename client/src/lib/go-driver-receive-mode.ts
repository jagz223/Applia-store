import type { GoDriverReceiveMode } from "@/lib/cargo-driver-storage";

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

export function receiveModeToGoSlug(mode: GoDriverReceiveMode): "cargo" | "pack" {
  return mode === "delivery" ? "pack" : "cargo";
}

export function goSlugToReceiveMode(slug: "cargo" | "pack"): GoDriverReceiveMode {
  return slug === "pack" ? "delivery" : "taxi";
}
