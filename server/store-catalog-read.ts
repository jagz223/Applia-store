import { appliaStorage } from "./storage-applia";
import {
  getCachedStoreProducts,
  setCachedStoreProducts,
} from "./store-catalog-cache";
import type { StoreProduct } from "@shared/store-schema";

export async function listStoreProductsCached(storeId: number): Promise<StoreProduct[]> {
  const hit = getCachedStoreProducts(storeId);
  if (hit) return hit;
  const products = await appliaStorage.listStoreProducts(storeId);
  setCachedStoreProducts(storeId, products);
  return products;
}
