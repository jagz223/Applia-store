/**
 * Mensualidad de suscripción de visibilidad (USD) configurable por categoría.
 * Persistencia: Firestore platform_settings/global.
 */
import { getFirestore, FIRESTORE_COLLECTIONS } from "./firebase-admin";
import type { Category } from "@shared/schema";
import { isCatalogAssignableServiceCategorySlug } from "@shared/catalog-service-categories";
import {
  expandSubscriptionFeesBySlugForStorage,
  subscriptionFeeLookupSlug,
} from "@shared/subscription-category-fees";
import {
  getProviderCategoryIds,
  slugForCategoryId,
  type ProviderCategorySlots,
} from "@shared/provider-category-membership";

const DOC_ID = "global";
const TTL_MS = 15_000;

export type SubscriptionFeesBySlug = Record<string, number>;

export const DEFAULT_SUBSCRIPTION_FEE_USD = 15;

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

export function categorySlugFromProvider(provider: any, categories: Category[] = []): string | null {
  const direct = typeof provider?.category === "string" ? provider.category.trim() : "";
  if (direct) return direct;
  const id = Number(provider?.categoryId);
  if (!Number.isFinite(id)) return null;
  const cat = categories.find((c: any) => Number((c as any)?.id) === id);
  const slug = cat && typeof (cat as any)?.slug === "string" ? String((cat as any).slug).trim() : "";
  return slug || null;
}

/**
 * Slug usado para calcular la mensualidad USD 15 (o tarifa admin por categoría).
 * Por ahora: la categoría con la que se registró (`subscriptionCategorySlug`), sin cambiar si luego es conductor.
 */
export function subscriptionCategorySlugFromProvider(
  provider: ProviderCategorySlots & { subscriptionCategorySlug?: string | null },
  categories: Category[] = [],
): string | null {
  const stored = String(provider?.subscriptionCategorySlug ?? "").trim();
  if (stored && isCatalogAssignableServiceCategorySlug(stored)) return stored;

  const primarySlug = slugForCategoryId(Number(provider?.categoryId), categories);
  if (primarySlug && isCatalogAssignableServiceCategorySlug(primarySlug)) return primarySlug;

  for (const id of getProviderCategoryIds(provider)) {
    const s = slugForCategoryId(id, categories);
    if (s && isCatalogAssignableServiceCategorySlug(s)) return s;
  }

  const legacy = categorySlugFromProvider(provider, categories);
  if (legacy && isCatalogAssignableServiceCategorySlug(legacy)) return legacy;
  return legacy;
}

export function subscriptionMonthlyUsdForCategorySlug(fees: SubscriptionFeesBySlug, slug: string | null | undefined): number {
  const s = subscriptionFeeLookupSlug(slug);
  if (!s) return DEFAULT_SUBSCRIPTION_FEE_USD;
  const v = fees?.[s];
  const n = Number(v);
  if (!Number.isFinite(n)) return DEFAULT_SUBSCRIPTION_FEE_USD;
  return Math.max(0, n);
}

