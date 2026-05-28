import {
  getProviderCategoryIds,
  slugForCategoryId,
  type ProviderCategorySlots,
} from "./provider-category-membership";
import {
  DEFAULT_SUBSCRIPTION_FEE_USD,
  subscriptionFeeLookupSlug,
  subscriptionMonthlyUsdForCategorySlug,
} from "./subscription-category-fees";

type CategoryRow = { id?: unknown; slug?: string | null };

export type ProviderForSubscriptionFee = ProviderCategorySlots & {
  category?: string | null;
  subscriptionCategorySlug?: string | null;
};

/** Slugs con tarifa de suscripción asociados al proveedor (slots, fichas activas, legacy y override admin). */
export function providerSubscriptionFeeSlugs(
  provider: ProviderForSubscriptionFee | null | undefined,
  categories: readonly CategoryRow[] = [],
  extraCategoryIds: readonly number[] = [],
): string[] {
  if (!provider && extraCategoryIds.length === 0) return [];
  const out: string[] = [];
  const slotIds = provider ? getProviderCategoryIds(provider) : [];
  const allIds = [...new Set([...slotIds, ...extraCategoryIds.filter((id) => Number.isFinite(id) && id > 0)])];
  for (const id of allIds) {
    const s = slugForCategoryId(id, categories);
    if (s) out.push(subscriptionFeeLookupSlug(s));
  }
  const legacy = String(provider?.category ?? "").trim();
  if (legacy) out.push(subscriptionFeeLookupSlug(legacy));
  const manual = String(provider?.subscriptionCategorySlug ?? "").trim();
  if (manual) out.push(subscriptionFeeLookupSlug(manual));
  return [...new Set(out.filter(Boolean))];
}

/** Mensualidad USD: la tarifa más alta entre todas las líneas del asociado (Man Go, Pro Go, Car Go, Marketplace, etc.). */
export function subscriptionMonthlyUsdForProvider(
  provider: ProviderForSubscriptionFee | null | undefined,
  fees: Record<string, number> | null | undefined,
  categories: readonly CategoryRow[] = [],
  extraCategoryIds: readonly number[] = [],
): number {
  const slugs = providerSubscriptionFeeSlugs(provider, categories, extraCategoryIds);
  if (slugs.length === 0) return DEFAULT_SUBSCRIPTION_FEE_USD;
  let max = 0;
  for (const slug of slugs) {
    max = Math.max(max, subscriptionMonthlyUsdForCategorySlug(fees, slug));
  }
  return max;
}

/** Slug de la categoría que define la mensualidad cobrada (la de mayor tarifa). */
export function subscriptionBillingCategorySlugFromProvider(
  provider: ProviderForSubscriptionFee | null | undefined,
  fees: Record<string, number> | null | undefined,
  categories: readonly CategoryRow[] = [],
  extraCategoryIds: readonly number[] = [],
): string | null {
  const slugs = providerSubscriptionFeeSlugs(provider, categories, extraCategoryIds);
  let bestSlug: string | null = null;
  let bestFee = -1;
  for (const slug of slugs) {
    const fee = subscriptionMonthlyUsdForCategorySlug(fees, slug);
    if (fee > bestFee) {
      bestFee = fee;
      bestSlug = slug;
    }
  }
  return bestSlug ?? slugs[0] ?? null;
}
