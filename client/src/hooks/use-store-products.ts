import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InsertStoreProduct, UpdateStoreProduct } from "@shared/store-schema";
import { ingredientMaterialKey } from "@shared/store-slug";

export type StoreProductSummary = {
  id: number;
  storeId: number;
  name: string;
  description: string | null;
  price: number;
  pricesByCurrency?: Record<string, number>;
  displayCurrencyId?: string;
  displayCurrencyLabel?: string;
  categoryIds: number[];
  ingredientMaterialIds: number[];
  imageUrls: string[];
  showOnShowcase: boolean;
  createdAt: string;
  updatedAt: string;
};

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function storeProductsQueryKey(storeId: number) {
  return ["/api/stores", storeId, "products"] as const;
}

export function useStoreProducts(storeId: number, enabled = true) {
  return useQuery({
    queryKey: storeProductsQueryKey(storeId),
    queryFn: async (): Promise<StoreProductSummary[]> => {
      const res = await fetch(`/api/stores/${storeId}/products`, { headers: authHeaders() });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudieron cargar los productos");
      }
      const data = (await res.json()) as { products: StoreProductSummary[] };
      return data.products;
    },
    enabled: enabled && storeId > 0,
  });
}

function invalidateStoreProductQueries(qc: ReturnType<typeof useQueryClient>, storeId: number) {
  void qc.invalidateQueries({ queryKey: storeProductsQueryKey(storeId) });
  void qc.invalidateQueries({ queryKey: ["/api/stores", storeId, "categories"] });
  void qc.invalidateQueries({
    predicate: (q) =>
      Array.isArray(q.queryKey) &&
      q.queryKey[0] === "/api/stores" &&
      q.queryKey[2] === "showcase-products",
  });
}

export function useCreateStoreProduct(storeId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: InsertStoreProduct) => {
      const res = await fetch(`/api/stores/${storeId}/products`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudo crear el producto");
      }
      const data = (await res.json()) as { product: StoreProductSummary };
      return data.product;
    },
    onSuccess: () => invalidateStoreProductQueries(qc, storeId),
  });
}

export function useUpdateStoreProduct(storeId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ productId, body }: { productId: number; body: UpdateStoreProduct }) => {
      const res = await fetch(`/api/stores/${storeId}/products/${productId}`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudo actualizar el producto");
      }
      const data = (await res.json()) as { product: StoreProductSummary };
      return data.product;
    },
    onSuccess: () => invalidateStoreProductQueries(qc, storeId),
  });
}

export function useDeleteStoreProduct(storeId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (productId: number) => {
      const res = await fetch(`/api/stores/${storeId}/products/${productId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudo eliminar el producto");
      }
    },
    onSuccess: () => invalidateStoreProductQueries(qc, storeId),
  });
}

export type IngredientMaterialItem = {
  id: number;
  name: string;
  normalizedName: string;
};

export function useIngredientsMaterials(search: string, page: number, enabled = true) {
  return useQuery({
    queryKey: ["/api/ingredients-materials", search, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page) });
      const q = search.trim();
      if (q) params.set("q", q);
      const res = await fetch(`/api/ingredients-materials?${params}`);
      if (!res.ok) throw new Error("No se pudieron cargar ingredientes y materiales");
      return res.json() as Promise<{
        items: IngredientMaterialItem[];
        total: number;
        page: number;
        limit: number;
      }>;
    },
    enabled,
  });
}

export async function findIngredientMaterialByName(name: string): Promise<IngredientMaterialItem | null> {
  const key = ingredientMaterialKey(name);
  const params = new URLSearchParams({ page: "1", q: name.trim() });
  const res = await fetch(`/api/ingredients-materials?${params}`);
  if (!res.ok) return null;
  const data = (await res.json()) as { items: IngredientMaterialItem[] };
  return data.items.find((item) => itemMatchesKey(item, key)) ?? null;
}

function itemMatchesKey(item: IngredientMaterialItem, key: string): boolean {
  return item.normalizedName === key || ingredientMaterialKey(item.name) === key;
}

export async function createOrSelectIngredientMaterial(name: string): Promise<IngredientMaterialItem> {
  const existing = await findIngredientMaterialByName(name);
  if (existing) return existing;
  try {
    return await createIngredientMaterial(name);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("Ya existe") || msg.includes("exist")) {
      const again = await findIngredientMaterialByName(name);
      if (again) return again;
    }
    throw e;
  }
}

export async function createIngredientMaterial(name: string): Promise<IngredientMaterialItem> {
  const token = localStorage.getItem("token");
  const res = await fetch("/api/ingredients-materials", {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message ?? "No se pudo crear el ingrediente");
  }
  const data = (await res.json()) as { item: IngredientMaterialItem };
  return data.item;
}
