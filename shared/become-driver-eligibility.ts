import type { CategorySlugRow } from "@shared/provider-go";

const PRIMARY_SLUGS_NOT_FOR_BECOME_DRIVER = new Set(["transport", "delivery"]);

export function resolveProviderPrimaryCategorySlug(
  provider: { categoryId?: number | null; category?: string | null } | null | undefined,
  categories: readonly CategorySlugRow[]
): string {
  if (!provider) return "";
  const id = provider.categoryId;
  if (id != null && Number.isFinite(Number(id))) {
    const row = categories.find((c) => Number(c.id) === Number(id));
    const s = String(row?.slug ?? "").trim().toLowerCase();
    if (s) return s;
  }
  return String(provider.category ?? "").trim().toLowerCase();
}

/** Categoría principal ya es taxi o delivery (alta inicial vía Become Pro u otro flujo). */
export function isPrimaryMobilityProviderCategory(slug: string): boolean {
  return PRIMARY_SLUGS_NOT_FOR_BECOME_DRIVER.has(String(slug ?? "").trim().toLowerCase());
}
