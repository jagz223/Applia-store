export const STORE_ADMIN_LIST_PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

export type StoreAdminListPageSize = (typeof STORE_ADMIN_LIST_PAGE_SIZE_OPTIONS)[number];

export type StoreCatalogItemLabelMode = "ingredients" | "materials";

export function isStoreTryOnEnabled(): boolean {
  return String(import.meta.env.VITE_STORE_TRY_ON_ENABLED ?? "").trim().toLowerCase() === "true";
}

/** Tamaño por caja en formulario de producto e import Excel. */
export function isStoreBoxSizeEnabled(): boolean {
  return String(import.meta.env.VITE_STORE_BOX_SIZE_ENABLED ?? "").trim().toLowerCase() === "true";
}

export function getStoreCatalogItemLabelMode(): StoreCatalogItemLabelMode {
  const raw = String(import.meta.env.VITE_STORE_CATALOG_ITEM_LABEL ?? "materials")
    .trim()
    .toLowerCase();
  return raw === "ingredients" ? "ingredients" : "materials";
}

export type StoreCatalogItemCopy = {
  mode: StoreCatalogItemLabelMode;
  singular: string;
  plural: string;
  singularTitle: string;
  pluralTitle: string;
};

export function getStoreCatalogItemCopy(): StoreCatalogItemCopy {
  if (getStoreCatalogItemLabelMode() === "ingredients") {
    return {
      mode: "ingredients",
      singular: "ingrediente",
      plural: "ingredientes",
      singularTitle: "Ingrediente",
      pluralTitle: "Ingredientes",
    };
  }
  return {
    mode: "materials",
    singular: "material",
    plural: "materiales",
    singularTitle: "Material",
    pluralTitle: "Materiales",
  };
}

const STORE_ADMIN_LIST_PAGE_SIZE_STORAGE_KEY = "store-admin-list-page-size";

export function readStoreAdminListPageSize(): StoreAdminListPageSize {
  if (typeof window === "undefined") return 10;
  const raw = Number.parseInt(localStorage.getItem(STORE_ADMIN_LIST_PAGE_SIZE_STORAGE_KEY) ?? "", 10);
  if ((STORE_ADMIN_LIST_PAGE_SIZE_OPTIONS as readonly number[]).includes(raw)) {
    return raw as StoreAdminListPageSize;
  }
  return 10;
}

export function writeStoreAdminListPageSize(pageSize: StoreAdminListPageSize): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORE_ADMIN_LIST_PAGE_SIZE_STORAGE_KEY, String(pageSize));
}
