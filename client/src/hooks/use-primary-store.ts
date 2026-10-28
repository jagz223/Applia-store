import { useQuery } from "@tanstack/react-query";

export type PrimaryStore = {
  id: number;
  name: string;
  slug: string;
};

export const PRIMARY_STORE_QUERY_KEY = ["/api/stores/primary"] as const;

export async function fetchPrimaryStore(): Promise<PrimaryStore | null> {
  const res = await fetch("/api/stores/primary");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message ?? "No se pudo cargar la tienda");
  }
  const data = (await res.json()) as { store: PrimaryStore | null };
  return data.store;
}

/** Vitrina pública de la tienda principal (PRIMARY_STORE_ID en shared/store-schema). */
export function getPrimaryStoreVitrinaHref(store: Pick<PrimaryStore, "slug"> | null | undefined): string {
  if (!store?.slug) return "/tienda";
  return `/tienda/${encodeURIComponent(store.slug)}`;
}

export function getPrimaryStoreImportCatalogHref(
  store: Pick<PrimaryStore, "slug"> | null | undefined,
): string {
  if (!store?.slug) return "/tienda";
  return `/tienda/${encodeURIComponent(store.slug)}/para-importar`;
}

export function getPrimaryStoreVitrinaCategoryHref(
  store: Pick<PrimaryStore, "slug"> | null | undefined,
  categoryName: string,
): string {
  const base = getPrimaryStoreVitrinaHref(store);
  const trimmed = categoryName.trim();
  if (!trimmed) return base;
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}category=${encodeURIComponent(trimmed)}`;
}

export function usePrimaryStore(enabled = true) {
  return useQuery({
    queryKey: PRIMARY_STORE_QUERY_KEY,
    queryFn: fetchPrimaryStore,
    enabled,
    staleTime: 60_000,
  });
}
