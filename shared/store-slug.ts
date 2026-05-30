/** Genera slug URL-safe a partir del nombre de la tienda. */
export function slugifyStoreName(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return base.length > 0 ? base : "tienda";
}

/** Resuelve slug único añadiendo sufijo numérico si hay colisión. */
export async function resolveUniqueStoreSlug(
  name: string,
  slugExists: (slug: string) => Promise<boolean>,
): Promise<string> {
  const base = slugifyStoreName(name);
  if (!(await slugExists(base))) return base;
  for (let n = 2; n < 10_000; n++) {
    const candidate = `${base}-${n}`;
    if (!(await slugExists(candidate))) return candidate;
  }
  throw new Error("No se pudo generar un slug único para la tienda");
}

export function normalizeIngredientMaterialName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export function ingredientMaterialKey(name: string): string {
  return normalizeIngredientMaterialName(name).toLowerCase();
}
