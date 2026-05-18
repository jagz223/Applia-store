/**
 * Mensualidad de suscripción de visibilidad (USD) configurable por categoría.
 * Persistencia: Firestore platform_settings/global.
 */
import { getFirestore, FIRESTORE_COLLECTIONS } from "./firebase-admin";
import type { Category } from "@shared/schema";
import {
  expandSubscriptionFeesBySlugForStorage,
} from "@shared/subscription-category-fees";
import {
  subscriptionBillingCategorySlugFromProvider,
  subscriptionMonthlyUsdForProvider,
  type ProviderForSubscriptionFee,
} from "@shared/provider-subscription-fee";

export {
  DEFAULT_SUBSCRIPTION_FEE_USD,
  subscriptionMonthlyUsdForCategorySlug,
} from "@shared/subscription-category-fees";
export {
  providerSubscriptionFeeSlugs,
  subscriptionMonthlyUsdForProvider,
  subscriptionBillingCategorySlugFromProvider,
} from "@shared/provider-subscription-fee";

const DOC_ID = "global";
const TTL_MS = 15_000;

export type SubscriptionFeesBySlug = Record<string, number>;

let cache: { value: SubscriptionFeesBySlug; at: number } | null = null;
let memoryOnly: SubscriptionFeesBySlug | null = null;

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function sanitize(input: SubscriptionFeesBySlug | null | undefined): SubscriptionFeesBySlug {
  const raw = input && typeof input === "object" ? input : {};
  const out: SubscriptionFeesBySlug = {};
  for (const [slug, v] of Object.entries(raw)) {
    const s = String(slug ?? "").trim();
    if (!s) continue;
    out[s] = clamp(Number(v), 0, 10_000);
  }
  return out;
}

export async function getSubscriptionFeesByCategorySlug(): Promise<SubscriptionFeesBySlug> {
  const db = getFirestore();
  if (!db) return memoryOnly ?? {};
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  try {
    const snap = await db.collection(FIRESTORE_COLLECTIONS.PLATFORM_SETTINGS).doc(DOC_ID).get();
    const raw = snap.exists ? (snap.data() as any)?.subscriptionFeesBySlug : null;
    const v = sanitize(raw);
    cache = { value: v, at: Date.now() };
    return v;
  } catch {
    return {};
  }
}

export function invalidateSubscriptionFeesCache(): void {
  cache = null;
}

export async function setSubscriptionFeesByCategorySlug(next: SubscriptionFeesBySlug): Promise<SubscriptionFeesBySlug> {
  const sanitized = sanitize(expandSubscriptionFeesBySlugForStorage(sanitize(next)));
  const db = getFirestore();
  if (db) {
    await db
      .collection(FIRESTORE_COLLECTIONS.PLATFORM_SETTINGS)
      .doc(DOC_ID)
      .set({ subscriptionFeesBySlug: sanitized, updatedAt: new Date() }, { merge: true });
  } else {
    memoryOnly = sanitized;
  }
  invalidateSubscriptionFeesCache();
  cache = { value: sanitized, at: Date.now() };
  return sanitized;
}

/** @deprecated Usar subscriptionBillingCategorySlugFromProvider */
export function categorySlugFromProvider(provider: any, categories: Category[] = []): string | null {
  const direct = typeof provider?.category === "string" ? provider.category.trim() : "";
  if (direct) return direct;
  const id = Number(provider?.categoryId);
  if (!Number.isFinite(id)) return null;
  const cat = categories.find((c: any) => Number((c as any)?.id) === id);
  const slug = cat && typeof (cat as any)?.slug === "string" ? String((cat as any).slug).trim() : "";
  return slug || null;
}

/** Slug de categoría usado para facturar la suscripción (mayor tarifa entre líneas del asociado). */
export function subscriptionCategorySlugFromProvider(
  provider: ProviderForSubscriptionFee,
  categories: Category[] = [],
  fees: SubscriptionFeesBySlug = {},
): string | null {
  return subscriptionBillingCategorySlugFromProvider(provider, fees, categories);
}
