import { appliaStorage } from "./storage-applia";

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
  const categories = await appliaStorage.listStoreCategories(storeId);
  const valid = new Set(categories.map((c) => c.id));
  for (const id of categoryIds) {
    if (!valid.has(id)) throw new Error("STORE_CATEGORY_INVALID");
  }
}

/** Sincroniza pertenencia: product.categoryIds es la fuente de verdad. */
export async function syncCategoryProductMembership(
  storeId: number,
  categoryId: number,
  productIds: number[],
): Promise<void> {
  const products = await appliaStorage.listStoreProducts(storeId);
  const target = new Set(productIds);

  for (const product of products) {
    const has = product.categoryIds.includes(categoryId);
    const shouldHave = target.has(product.id);
    if (has === shouldHave) continue;

    const nextIds = shouldHave
      ? [...product.categoryIds, categoryId]
      : product.categoryIds.filter((id) => id !== categoryId);

    await appliaStorage.updateStoreProduct(storeId, product.id, { categoryIds: nextIds });
  }
}

export async function removeCategoryFromAllProducts(storeId: number, categoryId: number): Promise<void> {
  const products = await appliaStorage.listStoreProducts(storeId);
  for (const product of products) {
    if (!product.categoryIds.includes(categoryId)) continue;
    await appliaStorage.updateStoreProduct(storeId, product.id, {
      categoryIds: product.categoryIds.filter((id) => id !== categoryId),
    });
  }
}
