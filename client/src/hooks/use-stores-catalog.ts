import { useQuery } from "@tanstack/react-query";

export type StoreCatalogItem = {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
  rubro?: string | null;
  rubroLabel?: string | null;
  coverImageUrl?: string | null;
};

export type StoresCatalogFilters = {
  q?: string;
  rubro?: string;
};

export function storesCatalogQueryKey(filters: StoresCatalogFilters = {}) {
  return ["/api/stores", filters.q ?? "", filters.rubro ?? ""] as const;
}

export function useStoresCatalog(filters: StoresCatalogFilters = {}) {
  const q = filters.q?.trim() ?? "";
  const rubro = filters.rubro?.trim() ?? "";

  return useQuery({
    queryKey: storesCatalogQueryKey(filters),
    queryFn: async (): Promise<StoreCatalogItem[]> => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (rubro) params.set("rubro", rubro);
      const qs = params.toString();
      const res = await fetch(`/api/stores${qs ? `?${qs}` : ""}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudo cargar el catálogo de tiendas");
      }
      const data = (await res.json()) as { stores: StoreCatalogItem[] };
      return data.stores;
    },
  });
}
