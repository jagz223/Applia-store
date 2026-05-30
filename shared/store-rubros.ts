import { z } from "zod";

/** Rubros predefinidos para clasificar tiendas en el catálogo. */
export const STORE_RUBROS = [
  { id: "tecnologia", label: "Tecnología" },
  { id: "moda", label: "Moda y ropa" },
  { id: "alimentos", label: "Alimentos y bebidas" },
  { id: "hogar", label: "Hogar y decoración" },
  { id: "salud-belleza", label: "Salud y belleza" },
  { id: "deportes", label: "Deportes" },
  { id: "mascotas", label: "Mascotas" },
  { id: "libros-papeleria", label: "Libros y papelería" },
  { id: "automotriz", label: "Automotriz" },
  { id: "servicios", label: "Servicios" },
  { id: "otros", label: "Otros" },
] as const;

export type StoreRubroId = (typeof STORE_RUBROS)[number]["id"];

export const STORE_RUBRO_IDS = STORE_RUBROS.map((r) => r.id) as [StoreRubroId, ...StoreRubroId[]];

export const storeRubroIdSchema = z.enum(STORE_RUBRO_IDS);

export function isStoreRubroId(value: string | null | undefined): value is StoreRubroId {
  return value != null && (STORE_RUBRO_IDS as readonly string[]).includes(value);
}

export function getStoreRubroLabel(rubro: string | null | undefined): string | null {
  if (!rubro) return null;
  return STORE_RUBROS.find((r) => r.id === rubro)?.label ?? null;
}

export function filterStoresByCatalogQuery<T extends { name: string; description?: string | null; rubro?: string | null }>(
  stores: T[],
  options: { q?: string; rubro?: string },
): T[] {
  const q = (options.q ?? "").trim().toLowerCase();
  const rubro = (options.rubro ?? "").trim();

  return stores.filter((store) => {
    if (rubro && store.rubro !== rubro) return false;
    if (!q) return true;
    const haystack = [store.name, store.description ?? ""].join(" ").toLowerCase();
    return haystack.includes(q);
  });
}
