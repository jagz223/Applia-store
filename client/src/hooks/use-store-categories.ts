import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InsertStoreCategory, UpdateStoreCategory } from "@shared/store-schema";
import {
  storeProductsQueryKey,
  type StoreAdminListPage,
} from "@/hooks/use-store-products";

export type StoreCategorySummary = {
  id: number;
  storeId: number;
  name: string;
  description: string | null;
  hideFromShowcaseAll?: boolean;
  productIds: number[];
  productCount: number;
  createdAt: string;
  updatedAt: string;
};

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function storeCategoriesQueryKey(storeId: number) {
  return ["/api/stores", storeId, "categories"] as const;
}

export function useStoreCategories(storeId: number, enabled = true) {
  return useQuery({
    queryKey: storeCategoriesQueryKey(storeId),
    queryFn: async (): Promise<StoreCategorySummary[]> => {
      const res = await fetch(`/api/stores/${storeId}/categories`, { headers: authHeaders() });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudieron cargar las categorías");
      }
      const data = (await res.json()) as { categories: StoreCategorySummary[] };
      return data.categories;
    },
    enabled: enabled && storeId > 0,
  });
}

export function useStoreCategoriesPage(
  storeId: number,
  page: number,
  limit = 10,
  enabled = true,
  search = "",
) {
  const safePage = Math.max(1, page);
  const safeLimit = Math.max(1, limit);
  const q = search.trim();
  return useQuery({
    queryKey: [...storeCategoriesQueryKey(storeId), "page", safePage, safeLimit, q || null],
    queryFn: async (): Promise<StoreAdminListPage<StoreCategorySummary>> => {
      const params = new URLSearchParams({
        page: String(safePage),
        limit: String(safeLimit),
      });
      if (q) params.set("q", q);
      const res = await fetch(`/api/stores/${storeId}/categories?${params}`, {
        headers: authHeaders(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudieron cargar las categorías");
      }
      const data = (await res.json()) as {
        categories: StoreCategorySummary[];
        total?: number;
        page?: number;
        limit?: number;
        totalPages?: number;
      };
      const total = data.total ?? data.categories.length;
      const pageLimit = data.limit ?? safeLimit;
      return {
        items: data.categories,
        total,
        page: data.page ?? safePage,
        limit: pageLimit,
        totalPages: data.totalPages ?? Math.max(1, Math.ceil(total / pageLimit)),
      };
    },
    enabled: enabled && storeId > 0,
  });
}

function invalidateCategoryQueries(qc: ReturnType<typeof useQueryClient>, storeId: number) {
  void qc.invalidateQueries({ queryKey: storeCategoriesQueryKey(storeId) });
  void qc.invalidateQueries({ queryKey: storeProductsQueryKey(storeId) });
  void qc.invalidateQueries({
    predicate: (q) =>
      Array.isArray(q.queryKey) &&
      q.queryKey[0] === "/api/stores" &&
      q.queryKey[2] === "showcase-products",
  });
}

export function useCreateStoreCategory(storeId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: InsertStoreCategory) => {
      const res = await fetch(`/api/stores/${storeId}/categories`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudo crear la categoría");
      }
      const data = (await res.json()) as { category: StoreCategorySummary };
      return data.category;
    },
    onSuccess: () => invalidateCategoryQueries(qc, storeId),
  });
}

export function useUpdateStoreCategory(storeId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ categoryId, body }: { categoryId: number; body: UpdateStoreCategory }) => {
      const res = await fetch(`/api/stores/${storeId}/categories/${categoryId}`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudo actualizar la categoría");
      }
      const data = (await res.json()) as { category: StoreCategorySummary };
      return data.category;
    },
    onSuccess: () => invalidateCategoryQueries(qc, storeId),
  });
}

export function useDeleteStoreCategory(storeId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (categoryId: number) => {
      const res = await fetch(`/api/stores/${storeId}/categories/${categoryId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudo eliminar la categoría");
      }
    },
    onSuccess: () => invalidateCategoryQueries(qc, storeId),
  });
}

export function categoriesFromIds(
  categories: StoreCategorySummary[],
  ids: number[],
): { id: number; name: string }[] {
  const map = new Map(categories.map((c) => [c.id, c.name]));
  return ids.map((id) => ({ id, name: map.get(id) ?? `Categoría #${id}` }));
}

export function productsFromIds(
  products: { id: number; name: string }[],
  ids: number[],
): { id: number; name: string }[] {
  const map = new Map(products.map((p) => [p.id, p.name]));
  return ids.map((id) => ({ id, name: map.get(id) ?? `Producto #${id}` }));
}
