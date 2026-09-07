import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InsertStoreSubcategory, UpdateStoreSubcategory } from "@shared/store-schema";
import {
  storeCategoriesQueryKey,
} from "@/hooks/use-store-categories";
import {
  storeProductsQueryKey,
  type StoreAdminListPage,
} from "@/hooks/use-store-products";

export type StoreSubcategorySummary = {
  id: number;
  storeId: number;
  categoryId: number;
  categoryName: string | null;
  name: string;
  description: string | null;
  productIds: number[];
  productCount: number;
  createdAt: string;
  updatedAt: string;
};

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function storeSubcategoriesQueryKey(storeId: number) {
  return ["/api/stores", storeId, "subcategories"] as const;
}

function invalidateSubcategoryQueries(qc: ReturnType<typeof useQueryClient>, storeId: number) {
  void qc.invalidateQueries({ queryKey: storeSubcategoriesQueryKey(storeId) });
  void qc.invalidateQueries({ queryKey: storeCategoriesQueryKey(storeId) });
  void qc.invalidateQueries({ queryKey: storeProductsQueryKey(storeId) });
  void qc.invalidateQueries({
    predicate: (q) =>
      Array.isArray(q.queryKey) &&
      q.queryKey[0] === "/api/stores" &&
      q.queryKey[2] === "showcase-products",
  });
}

export function useStoreSubcategories(
  storeId: number,
  enabled = true,
  categoryId?: number | null,
) {
  const cat = categoryId != null && categoryId > 0 ? categoryId : null;
  return useQuery({
    queryKey: [...storeSubcategoriesQueryKey(storeId), "all", cat],
    queryFn: async (): Promise<StoreSubcategorySummary[]> => {
      const params = new URLSearchParams();
      if (cat) params.set("categoryId", String(cat));
      const qs = params.toString();
      const res = await fetch(
        `/api/stores/${storeId}/subcategories${qs ? `?${qs}` : ""}`,
        { headers: authHeaders() },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          (err as { message?: string }).message ?? "No se pudieron cargar las subcategorías",
        );
      }
      const data = (await res.json()) as { subcategories: StoreSubcategorySummary[] };
      return data.subcategories;
    },
    enabled: enabled && storeId > 0,
  });
}

export function useStoreSubcategoriesPage(
  storeId: number,
  page: number,
  limit = 10,
  enabled = true,
  search = "",
  categoryId?: number | null,
) {
  const safePage = Math.max(1, page);
  const safeLimit = Math.max(1, limit);
  const q = search.trim();
  const cat = categoryId != null && categoryId > 0 ? categoryId : null;
  return useQuery({
    queryKey: [
      ...storeSubcategoriesQueryKey(storeId),
      "page",
      safePage,
      safeLimit,
      q || null,
      cat,
    ],
    queryFn: async (): Promise<StoreAdminListPage<StoreSubcategorySummary>> => {
      const params = new URLSearchParams({
        page: String(safePage),
        limit: String(safeLimit),
      });
      if (q) params.set("q", q);
      if (cat) params.set("categoryId", String(cat));
      const res = await fetch(`/api/stores/${storeId}/subcategories?${params}`, {
        headers: authHeaders(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          (err as { message?: string }).message ?? "No se pudieron cargar las subcategorías",
        );
      }
      const data = (await res.json()) as {
        subcategories: StoreSubcategorySummary[];
        total?: number;
        page?: number;
        limit?: number;
        totalPages?: number;
      };
      const total = data.total ?? data.subcategories.length;
      const pageLimit = data.limit ?? safeLimit;
      return {
        items: data.subcategories,
        total,
        page: data.page ?? safePage,
        limit: pageLimit,
        totalPages: data.totalPages ?? Math.max(1, Math.ceil(total / pageLimit)),
      };
    },
    enabled: enabled && storeId > 0,
  });
}

export function useCreateStoreSubcategory(storeId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: InsertStoreSubcategory) => {
      const res = await fetch(`/api/stores/${storeId}/subcategories`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          (err as { message?: string }).message ?? "No se pudo crear la subcategoría",
        );
      }
      const data = (await res.json()) as { subcategory: StoreSubcategorySummary };
      return data.subcategory;
    },
    onSuccess: () => invalidateSubcategoryQueries(qc, storeId),
  });
}

export function useUpdateStoreSubcategory(storeId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      subcategoryId,
      body,
    }: {
      subcategoryId: number;
      body: UpdateStoreSubcategory;
    }) => {
      const res = await fetch(`/api/stores/${storeId}/subcategories/${subcategoryId}`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          (err as { message?: string }).message ?? "No se pudo actualizar la subcategoría",
        );
      }
      const data = (await res.json()) as { subcategory: StoreSubcategorySummary };
      return data.subcategory;
    },
    onSuccess: () => invalidateSubcategoryQueries(qc, storeId),
  });
}

export function useDeleteStoreSubcategory(storeId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (subcategoryId: number) => {
      const res = await fetch(`/api/stores/${storeId}/subcategories/${subcategoryId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          (err as { message?: string }).message ?? "No se pudo eliminar la subcategoría",
        );
      }
    },
    onSuccess: () => invalidateSubcategoryQueries(qc, storeId),
  });
}

export function subcategoriesFromIds(
  subcategories: StoreSubcategorySummary[],
  ids: number[],
): { id: number; name: string; categoryId: number }[] {
  const map = new Map(subcategories.map((s) => [s.id, s]));
  return ids.map((id) => {
    const s = map.get(id);
    return {
      id,
      name: s?.name ?? `Subcategoría #${id}`,
      categoryId: s?.categoryId ?? 0,
    };
  });
}
