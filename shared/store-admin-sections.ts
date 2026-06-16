export const STORE_ADMIN_SECTIONS = [
  { id: "productos", label: "Productos", path: "productos" },
  { id: "categorias", label: "Categorías", path: "categorias" },
  { id: "promociones", label: "Promociones", path: "promociones" },
  { id: "codigos", label: "Códigos de descuento", path: "codigos" },
  { id: "ordenes", label: "Órdenes", path: "ordenes" },
  { id: "configuracion", label: "Configuraciones de tienda", path: "configuracion" },
] as const;

export type StoreAdminSectionId = (typeof STORE_ADMIN_SECTIONS)[number]["id"];

/** Secciones ocultas temporalmente en el menú del admin. */
export const STORE_ADMIN_SECTIONS_HIDDEN: StoreAdminSectionId[] = ["codigos"];

export function getVisibleStoreAdminSections() {
  const hidden = new Set(STORE_ADMIN_SECTIONS_HIDDEN);
  return STORE_ADMIN_SECTIONS.filter((s) => !hidden.has(s.id));
}

export function isStoreAdminSection(value: string | undefined): value is StoreAdminSectionId {
  return STORE_ADMIN_SECTIONS.some((s) => s.path === value || s.id === value);
}

export function normalizeStoreAdminSection(value: string | undefined): StoreAdminSectionId {
  if (value && isStoreAdminSection(value)) {
    const match = STORE_ADMIN_SECTIONS.find((s) => s.path === value || s.id === value);
    const id = match?.id ?? "productos";
    if (STORE_ADMIN_SECTIONS_HIDDEN.includes(id)) return "productos";
    return id;
  }
  return "productos";
}

export function storeAdminSectionPath(section: StoreAdminSectionId): string {
  return STORE_ADMIN_SECTIONS.find((s) => s.id === section)?.path ?? "productos";
}
