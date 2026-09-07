import { appliaStorage } from "./storage-applia";

export function productIdsForSubcategory(
  products: { id: number; subcategoryIds?: number[] }[],
  subcategoryId: number,
): number[] {
  return products
    .filter((p) => (p.subcategoryIds ?? []).includes(subcategoryId))
    .map((p) => p.id);
}

export async function assertStoreSubcategoryIds(
  storeId: number,
  subcategoryIds: number[],
  allowedCategoryIds?: number[],
): Promise<void> {
  if (subcategoryIds.length === 0) return;
  const subcategories = await appliaStorage.listStoreSubcategories(storeId);
  const byId = new Map(subcategories.map((s) => [s.id, s]));
  const allowed =
    allowedCategoryIds != null ? new Set(allowedCategoryIds) : null;
  for (const id of subcategoryIds) {
    const sub = byId.get(id);
    if (!sub) throw new Error("STORE_SUBCATEGORY_INVALID");
    if (allowed && !allowed.has(sub.categoryId)) {
      throw new Error("STORE_SUBCATEGORY_CATEGORY_MISMATCH");
    }
  }
}

/** Deja solo subcategorías cuya categoría padre sigue en categoryIds. */
export async function pruneProductSubcategoryIds(
  storeId: number,
  categoryIds: number[],
  subcategoryIds: number[],
): Promise<number[]> {
  if (subcategoryIds.length === 0) return [];
  const allowed = new Set(categoryIds);
  const subcategories = await appliaStorage.listStoreSubcategories(storeId);
  const byId = new Map(subcategories.map((s) => [s.id, s]));
  return subcategoryIds.filter((id) => {
    const sub = byId.get(id);
    return sub != null && allowed.has(sub.categoryId);
  });
}

export async function removeSubcategoryFromAllProducts(
  storeId: number,
  subcategoryId: number,
): Promise<void> {
  const products = await appliaStorage.listStoreProducts(storeId);
  for (const product of products) {
    const ids = product.subcategoryIds ?? [];
    if (!ids.includes(subcategoryId)) continue;
    await appliaStorage.updateStoreProduct(storeId, product.id, {
      subcategoryIds: ids.filter((id) => id !== subcategoryId),
    });
  }
}

export async function deleteSubcategoriesForCategory(
  storeId: number,
  categoryId: number,
): Promise<void> {
  const subs = await appliaStorage.listStoreSubcategories(storeId, { categoryId });
  for (const sub of subs) {
    await removeSubcategoryFromAllProducts(storeId, sub.id);
    await appliaStorage.deleteStoreSubcategory(storeId, sub.id);
  }
}

export async function createSubcategoriesForCategory(
  storeId: number,
  categoryId: number,
  names: string[],
): Promise<void> {
  const seen = new Set<string>();
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    await appliaStorage.createStoreSubcategory(storeId, {
      categoryId,
      name,
      description: null,
    });
  }
}
