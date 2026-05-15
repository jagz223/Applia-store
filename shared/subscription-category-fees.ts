import { MAN_GO_CATEGORY_SLUG } from "./default-categories";

/** Slugs editables en admin → Suscripción mensual (orden de pantalla). */
export const SUBSCRIPTION_FEE_ADMIN_SLUGS = [
  MAN_GO_CATEGORY_SLUG,
  "transport",
  "professional",
] as const;

export type SubscriptionFeeAdminSlug = (typeof SUBSCRIPTION_FEE_ADMIN_SLUGS)[number];

/** Pack Go y Shop Go comparten la mensualidad de Car Go (`transport`). */
export const MOBILITY_SUBSCRIPTION_FEE_ALIAS_SLUGS = ["delivery", "marketplace"] as const;

export function subscriptionFeeLookupSlug(slug: string | null | undefined): string {
  const s = String(slug ?? "").trim();
  if ((MOBILITY_SUBSCRIPTION_FEE_ALIAS_SLUGS as readonly string[]).includes(s)) return "transport";
  return s;
}

/** Al guardar tarifas, replica el valor de Car Go en delivery y marketplace. */
export function expandSubscriptionFeesBySlugForStorage(fees: Record<string, number>): Record<string, number> {
  const out = { ...fees };
  const carGo = out.transport;
  if (carGo !== undefined && Number.isFinite(Number(carGo))) {
    for (const alias of MOBILITY_SUBSCRIPTION_FEE_ALIAS_SLUGS) {
      out[alias] = Number(carGo);
    }
  }
  return out;
}

export function subscriptionFeeAdminLabel(slug: SubscriptionFeeAdminSlug): string {
  if (slug === MAN_GO_CATEGORY_SLUG) return "Man Go";
  if (slug === "transport") return "Car Go";
  if (slug === "professional") return "Pro Go";
  return slug;
}

export function subscriptionFeeAdminHint(slug: SubscriptionFeeAdminSlug): string | undefined {
  if (slug === "transport") return "La misma tarifa aplica a Delivery y Shop Go.";
  return undefined;
}
