import { appliaStorage } from "./storage-applia";
import { storeCatalogNameKey } from "@shared/store-slug";

export function productIdsForCategory(
  products: { id: number; categoryIds: number[] }[],
  categoryId: number,
): number[] {
  return products.filter((p) => p.categoryIds.includes(categoryId)).map((p) => p.id);
}

export async function assertStoreCategoryIds(
  storeId: number,
  categoryIds: number[],
): Promise<void> {
  if (categoryIds.length === 0) return;
  const categories = await appliaStorage.listStoreCategories(storeId, { persistRenumber: false });
  const valid = new Set(categories.map((c) => c.id));
  for (const id of categoryIds) {
    if (!valid.has(id)) throw new Error("STORE_CATEGORY_INVALID");
  }
}

export async function assertStoreCategoryNameAvailable(
  storeId: number,
  name: string,
  exceptCategoryId?: number,
): Promise<void> {
  const key = storeCatalogNameKey(name);
  if (!key) return;
  const categories = await appliaStorage.listStoreCategories(storeId, { persistRenumber: false });
  const clash = categories.find(
    (c) => c.id !== exceptCategoryId && storeCatalogNameKey(c.name) === key,
  );
  if (clash) throw new Error("STORE_CATEGORY_NAME_EXISTS");
}

/** Sincroniza pertenencia: product.categoryIds es la fuente de verdad. */
export async function syncCategoryProductMembership(
  storeId: number,
  categoryId: number,
  productIds: number[],
): Promise<void> {
  const target = new Set(productIds.filter((id) => Number.isFinite(id) && id > 0));
  const [currentMembers, targetProducts] = await Promise.all([
    appliaStorage.listStoreProductsByCategoryId(storeId, categoryId),
    target.size > 0 ? appliaStorage.getStoreProductsByIds(storeId, [...target]) : Promise.resolve([]),
  ]);

  const currentIds = new Set(currentMembers.map((p) => p.id));
  const byId = new Map<number, (typeof currentMembers)[number]>();
  for (const product of currentMembers) byId.set(product.id, product);
  for (const product of targetProducts) byId.set(product.id, product);

  const toChange: Array<{ id: number; categoryIds: number[] }> = [];
  for (const id of currentIds) {
    if (target.has(id)) continue;
    const product = byId.get(id);
    if (!product) continue;
    toChange.push({
      id,
      categoryIds: product.categoryIds.filter((cid) => cid !== categoryId),
    });
  }
  for (const id of target) {
    if (currentIds.has(id)) continue;
    const product = byId.get(id);
    if (!product) continue;
    if (product.categoryIds.includes(categoryId)) continue;
    toChange.push({
      id,
      categoryIds: [...product.categoryIds, categoryId],
    });
  }

  for (const row of toChange) {
    await appliaStorage.updateStoreProduct(storeId, row.id, { categoryIds: row.categoryIds });
  }
}

export async function removeCategoryFromAllProducts(storeId: number, categoryId: number): Promise<void> {
  const members = await appliaStorage.listStoreProductsByCategoryId(storeId, categoryId);
  for (const product of members) {
    await appliaStorage.updateStoreProduct(storeId, product.id, {
      categoryIds: product.categoryIds.filter((id) => id !== categoryId),
    });
  }
}
