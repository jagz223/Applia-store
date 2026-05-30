export const STORE_ADMIN_SECTIONS = [
  { id: "productos", label: "Productos", path: "productos" },
  { id: "categorias", label: "Categorías", path: "categorias" },
  { id: "promociones", label: "Promociones", path: "promociones" },
  { id: "codigos", label: "Códigos de descuento", path: "codigos" },
  { id: "configuracion", label: "Configuraciones de tienda", path: "configuracion" },
] as const;

export type StoreAdminSectionId = (typeof STORE_ADMIN_SECTIONS)[number]["id"];

export function isStoreAdminSection(value: string | undefined): value is StoreAdminSectionId {
  return STORE_ADMIN_SECTIONS.some((s) => s.path === value || s.id === value);
}

export function normalizeStoreAdminSection(value: string | undefined): StoreAdminSectionId {
  if (value && isStoreAdminSection(value)) {
    const match = STORE_ADMIN_SECTIONS.find((s) => s.path === value || s.id === value);
    return match?.id ?? "productos";
  }
  return "productos";
}

export function storeAdminSectionPath(section: StoreAdminSectionId): string {
  return STORE_ADMIN_SECTIONS.find((s) => s.id === section)?.path ?? "productos";
}
