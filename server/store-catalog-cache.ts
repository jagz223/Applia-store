import type { StoreProduct } from "@shared/store-schema";

/** Caché corta del catálogo para no releer Firestore en cada página de vitrina. */
const STORE_PRODUCTS_CACHE_TTL_MS = 45_000;

type StoreProductsCacheEntry = {
  at: number;
  products: StoreProduct[];
};

const storeProductsCache = new Map<number, StoreProductsCacheEntry>();

export function getCachedStoreProducts(storeId: number): StoreProduct[] | null {
  const entry = storeProductsCache.get(storeId);
  if (!entry) return null;
  if (Date.now() - entry.at > STORE_PRODUCTS_CACHE_TTL_MS) {
    storeProductsCache.delete(storeId);
    return null;
  }
  return entry.products;
}

export function setCachedStoreProducts(storeId: number, products: StoreProduct[]): void {
  storeProductsCache.set(storeId, { at: Date.now(), products });
}

export function invalidateStoreProductsCache(storeId: number): void {
  storeProductsCache.delete(storeId);
}
