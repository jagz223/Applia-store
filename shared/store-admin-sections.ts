export const STORE_ADMIN_SECTIONS = [
  { id: "productos", label: "Productos", path: "productos" },
  { id: "categorias", label: "Categorías", path: "categorias" },
  { id: "ingredientes", label: "Ingredientes", path: "ingredientes" },
  { id: "promociones", label: "Promociones", path: "promociones" },
  { id: "codigos", label: "Códigos de descuento", path: "codigos" },
  { id: "ordenes", label: "Órdenes", path: "ordenes" },
  { id: "chat_sucursales", label: "Chat", path: "chat-sucursales" },
  { id: "banners_popups", label: "Banners y Pop ups", path: "banners-popups" },
  { id: "moneda", label: "Moneda", path: "moneda" },
  { id: "metodos_pago", label: "Métodos de pago", path: "metodos-pago" },
  { id: "configuracion", label: "Configuraciones de tienda", path: "configuracion" },
  { id: "usuarios", label: "Usuarios", path: "usuarios" },
  { id: "estadisticas", label: "Estadísticas", path: "estadisticas" },
] as const;

export type StoreAdminSectionId = (typeof STORE_ADMIN_SECTIONS)[number]["id"];

/** Secciones visibles para empleados de la tienda. */
export const STORE_ADMIN_EMPLOYEE_SECTIONS: StoreAdminSectionId[] = [
  "ordenes",
  "chat_sucursales",
  "usuarios",
];

/** Secciones ocultas temporalmente en el menú del admin. */
export const STORE_ADMIN_SECTIONS_HIDDEN: StoreAdminSectionId[] = ["codigos"];

export function getVisibleStoreAdminSections(options?: { employeeOnly?: boolean; includeStaff?: boolean }) {
  const hidden = new Set(STORE_ADMIN_SECTIONS_HIDDEN);
  let sections = STORE_ADMIN_SECTIONS.filter((s) => !hidden.has(s.id));
  if (options?.employeeOnly) {
    const allowed = new Set(STORE_ADMIN_EMPLOYEE_SECTIONS);
    return sections.filter((s) => allowed.has(s.id));
  }
  if (options?.includeStaff === false) {
    sections = sections.filter((s) => s.id !== "usuarios");
  }
  return sections;
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

/** Enlace al chat de tienda (sucursales + coordinación). */
export function getStoreAdminChatHref(slug: string): string {
  return `/tienda/${encodeURIComponent(slug)}/admin/${storeAdminSectionPath("chat_sucursales")}`;
}
