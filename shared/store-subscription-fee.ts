import {
  DEFAULT_SUBSCRIPTION_FEE_USD,
  formatSubscriptionUsdLabel,
  STORE_SUBSCRIPTION_FEE_SLUG,
  subscriptionMonthlyUsdForCategorySlug,
} from "./subscription-category-fees";
import { extendVisibilitySubscriptionEndsAtByMonths } from "./professional-listing-subscription";

export { STORE_SUBSCRIPTION_FEE_SLUG };

/** USD/mes de visibilidad de tienda según tarifas de plataforma. */
export function subscriptionMonthlyUsdForStore(
  fees: Record<string, number> | null | undefined,
  defaultUsd: number = DEFAULT_SUBSCRIPTION_FEE_USD,
): number {
  return subscriptionMonthlyUsdForCategorySlug(fees, STORE_SUBSCRIPTION_FEE_SLUG, defaultUsd);
}

export function storeSubscriptionQuoteLabel(monthlyUsd: number): string {
  return formatSubscriptionUsdLabel(monthlyUsd);
}

/** Tras pago validado (Prompt 3): extiende vigencia de la tienda N meses. */
export function extendStoreVisibilitySubscriptionEndsAt(
  prevEndsAtRaw: unknown,
  months: number,
  approvalAt: Date = new Date(),
): string {
  return extendVisibilitySubscriptionEndsAtByMonths(prevEndsAtRaw, months, approvalAt);
}
