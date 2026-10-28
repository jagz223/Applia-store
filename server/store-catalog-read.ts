import { appliaStorage } from "./storage-applia";
import {
  getCachedStoreBySlug,
  getCachedStoreCatalogBundle,
  getCachedStoreProducts,
  setCachedStoreBySlug,
  setCachedStoreCatalogBundle,
  setCachedStoreProducts,
  type StoreCatalogBundle,
} from "./store-catalog-cache";
import type { Store, StoreProduct } from "@shared/store-schema";

const inflightBundles = new Map<number, Promise<StoreCatalogBundle>>();
const inflightProducts = new Map<number, Promise<StoreProduct[]>>();
const inflightStoreBySlug = new Map<string, Promise<Store | undefined>>();

export async function getStoreBySlugCached(slug: string): Promise<Store | undefined> {
  const key = slug.trim().toLowerCase();
  if (!key) return undefined;

  const hit = getCachedStoreBySlug(key);
  if (hit !== null) return hit;

  const pending = inflightStoreBySlug.get(key);
  if (pending) return pending;

  const load = (async () => {
    const store = await appliaStorage.getStoreBySlug(key);
    setCachedStoreBySlug(key, store);
    return store;
  })().finally(() => {
    inflightStoreBySlug.delete(key);
  });

  inflightStoreBySlug.set(key, load);
  return load;
}

export async function listStoreProductsCached(storeId: number): Promise<StoreProduct[]> {
  const hit = getCachedStoreProducts(storeId);
  if (hit) return hit;

  const pending = inflightProducts.get(storeId);
  if (pending) return pending;

  const load = (async () => {
    const products = await appliaStorage.listStoreProducts(storeId);
    setCachedStoreProducts(storeId, products);
    return products;
  })().finally(() => {
    inflightProducts.delete(storeId);
  });

  inflightProducts.set(storeId, load);
  return load;
}

export async function getStoreCatalogBundleCached(storeId: number): Promise<StoreCatalogBundle> {
  const hit = getCachedStoreCatalogBundle(storeId);
  if (hit) return hit;

  const pending = inflightBundles.get(storeId);
  if (pending) return pending;

  const load = (async () => {
    const [products, categories, subcategories, promotions, banners, popups] = await Promise.all([
      listStoreProductsCached(storeId),
      appliaStorage.listStoreCategories(storeId, { persistRenumber: false }),
      appliaStorage.listStoreSubcategories(storeId),
      appliaStorage.listStorePromotions(storeId),
      appliaStorage.listStoreShowcaseAds(storeId, "banner"),
      appliaStorage.listStoreShowcaseAds(storeId, "popup"),
    ]);
    const bundle: StoreCatalogBundle = {
      products,
      categories,
      subcategories,
      promotions,
      banners,
      popups,
    };
    setCachedStoreCatalogBundle(storeId, bundle);
    return bundle;
  })().finally(() => {
    inflightBundles.delete(storeId);
  });

  inflightBundles.set(storeId, load);
  return load;
}
