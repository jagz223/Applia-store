import { MAN_GO_CATEGORY_SLUG, MARKETPLACE_CATEGORY_SLUG } from "./default-categories";

/** Slugs editables en admin → Suscripción mensual (orden de pantalla). */
export const SUBSCRIPTION_FEE_ADMIN_SLUGS = [
  MAN_GO_CATEGORY_SLUG,
  "transport",
  MARKETPLACE_CATEGORY_SLUG,
  "professional",
] as const;

export type SubscriptionFeeAdminSlug = (typeof SUBSCRIPTION_FEE_ADMIN_SLUGS)[number];

/** Pack Go comparte la mensualidad de Car Go (`transport`). Marketplace es independiente. */
export const MOBILITY_SUBSCRIPTION_FEE_ALIAS_SLUGS = ["delivery"] as const;

export function subscriptionFeeLookupSlug(slug: string | null | undefined): string {
  const s = String(slug ?? "").trim();
  if ((MOBILITY_SUBSCRIPTION_FEE_ALIAS_SLUGS as readonly string[]).includes(s)) return "transport";
  return s;
}

/** Al guardar tarifas, replica el valor de Car Go en delivery. */
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
  if (slug === MARKETPLACE_CATEGORY_SLUG) return "Marketplace";
  if (slug === "professional") return "Pro Go";
  return slug;
}

export function subscriptionFeeAdminHint(slug: SubscriptionFeeAdminSlug): string | undefined {
  if (slug === "transport") return "La misma tarifa aplica a Delivery (Pack Go).";
  if (slug === MARKETPLACE_CATEGORY_SLUG) {
    return "Mensualidad de visibilidad para asociados del catálogo Marketplace.";
  }
  return undefined;
}

/** Marcas (slug de categoría) que determinan si la fila de mensualidad aparece en admin → Configuración. */
export function subscriptionFeeAdminBrandSlugs(feeSlug: SubscriptionFeeAdminSlug): readonly string[] {
  if (feeSlug === "transport") return ["transport"];
  return [feeSlug];
}

function brandHidden(
  slug: string,
  brandUiHiddenBySlug: ReadonlyMap<string, boolean> | Readonly<Record<string, boolean>>,
): boolean {
  const key = String(slug ?? "").trim().toLowerCase();
  if (!key) return false;
  if (brandUiHiddenBySlug instanceof Map) return brandUiHiddenBySlug.get(key) === true;
  return (brandUiHiddenBySlug as Record<string, boolean>)[key] === true;
}

/**
 * Muestra el editor de mensualidad solo si la marca está activa en admin → Servicios (no uiHidden).
 * Ocultar aquí no borra ni cambia la tarifa guardada.
 */
export function isSubscriptionFeeVisibleInAdminSettings(
  feeSlug: SubscriptionFeeAdminSlug,
  brandUiHiddenBySlug: ReadonlyMap<string, boolean> | Readonly<Record<string, boolean>>,
): boolean {
  const brandSlugs = subscriptionFeeAdminBrandSlugs(feeSlug);
  return brandSlugs.some((s) => !brandHidden(s, brandUiHiddenBySlug));
}

export const DEFAULT_SUBSCRIPTION_FEE_USD = 15;

/** Etiqueta de precio para UI: "USD 15", "USD 22.5", etc. */
export function formatSubscriptionUsdLabel(usd: number): string {
  const n = Number(usd);
  if (!Number.isFinite(n) || n < 0) return `USD ${DEFAULT_SUBSCRIPTION_FEE_USD}`;
  const display = Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
  return `USD ${display}`;
}

/** USD/mes para un slug de categoría según tarifas de plataforma (fallback 15). */
export function subscriptionMonthlyUsdForCategorySlug(
  fees: Record<string, number> | null | undefined,
  slug: string | null | undefined,
  defaultUsd: number = DEFAULT_SUBSCRIPTION_FEE_USD,
): number {
  const s = subscriptionFeeLookupSlug(slug);
  if (!s) return defaultUsd;
  const v = fees?.[s];
  const n = Number(v);
  if (!Number.isFinite(n)) return defaultUsd;
  return Math.max(0, n);
}
