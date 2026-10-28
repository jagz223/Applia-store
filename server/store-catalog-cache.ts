import type {
  Store,
  StoreCategory,
  StoreProduct,
  StorePromotion,
  StoreSubcategory,
} from "@shared/store-schema";
import type { StoreShowcaseAdItem } from "@shared/store-showcase-ads-schema";

const STORE_CATALOG_CACHE_TTL_MS = 120_000;
/** Caché corta de tienda por slug (cold path vitrina: by-slug + meta + products). */
const STORE_BY_SLUG_CACHE_TTL_MS = 45_000;

export type StoreCatalogBundle = {
  products: StoreProduct[];
  categories: StoreCategory[];
  subcategories: StoreSubcategory[];
  promotions: StorePromotion[];
  banners: StoreShowcaseAdItem[];
  popups: StoreShowcaseAdItem[];
};

type StoreCatalogCacheEntry = {
  at: number;
  bundle: StoreCatalogBundle;
};

type StoreProductsCacheEntry = {
  at: number;
  products: StoreProduct[];
};

const storeCatalogBundleCache = new Map<number, StoreCatalogCacheEntry>();
const storeProductsCache = new Map<number, StoreProductsCacheEntry>();

type StoreBySlugCacheEntry = {
  at: number;
  store: Store | undefined;
};

const storeBySlugCache = new Map<string, StoreBySlugCacheEntry>();

export function getCachedStoreBySlug(slug: string): Store | undefined | null {
  const key = slug.trim().toLowerCase();
  if (!key) return null;
  const entry = storeBySlugCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > STORE_BY_SLUG_CACHE_TTL_MS) {
    storeBySlugCache.delete(key);
    return null;
  }
  return entry.store;
}

export function setCachedStoreBySlug(slug: string, store: Store | undefined): void {
  const key = slug.trim().toLowerCase();
  if (!key) return;
  storeBySlugCache.set(key, { at: Date.now(), store });
}

export function invalidateStoreBySlugCache(storeId?: number): void {
  if (storeId == null) {
    storeBySlugCache.clear();
    return;
  }
  for (const [key, entry] of storeBySlugCache) {
    if (entry.store?.id === storeId) storeBySlugCache.delete(key);
  }
}

export function getCachedStoreProducts(storeId: number): StoreProduct[] | null {
  const bundle = getCachedStoreCatalogBundle(storeId);
  if (bundle) return bundle.products;
  const entry = storeProductsCache.get(storeId);
  if (!entry) return null;
  if (Date.now() - entry.at > STORE_CATALOG_CACHE_TTL_MS) {
    storeProductsCache.delete(storeId);
    return null;
  }
  return entry.products;
}

export function setCachedStoreProducts(storeId: number, products: StoreProduct[]): void {
  storeProductsCache.set(storeId, { at: Date.now(), products });
  const bundleEntry = storeCatalogBundleCache.get(storeId);
  if (bundleEntry) {
    storeCatalogBundleCache.set(storeId, {
      at: Date.now(),
      bundle: { ...bundleEntry.bundle, products },
    });
  }
}

export function getCachedStoreCatalogBundle(storeId: number): StoreCatalogBundle | null {
  const entry = storeCatalogBundleCache.get(storeId);
  if (!entry) return null;
  if (Date.now() - entry.at > STORE_CATALOG_CACHE_TTL_MS) {
    storeCatalogBundleCache.delete(storeId);
    return null;
  }
  return entry.bundle;
}

export function setCachedStoreCatalogBundle(storeId: number, bundle: StoreCatalogBundle): void {
  const at = Date.now();
  storeCatalogBundleCache.set(storeId, { at, bundle });
  storeProductsCache.set(storeId, { at, products: bundle.products });
}

export function invalidateStoreProductsCache(storeId: number): void {
  storeProductsCache.delete(storeId);
  storeCatalogBundleCache.delete(storeId);
  invalidateStoreBySlugCache(storeId);
}

export function invalidateStoreCatalogCache(storeId: number): void {
  invalidateStoreProductsCache(storeId);
}
