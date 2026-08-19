import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InsertStoreProduct, UpdateStoreProduct } from "@shared/store-schema";
import { ingredientMaterialKey } from "@shared/store-slug";

export type StoreProductSizeSummary = {
  id: string;
  name: string;
  pricesByCurrency: Record<string, number>;
  price?: number;
  weight?: number;
};

export type StoreProductAdditionalSummary = {
  ingredientMaterialId: number;
  price: number;
  pricesByCurrency?: Record<string, number>;
  pricesBySize?: Record<string, Record<string, number>>;
};

export type StoreProductSummary = {
  id: number;
  storeId: number;
  name: string;
  description: string | null;
  price: number;
  pricesByCurrency?: Record<string, number>;
  sizes?: StoreProductSizeSummary[];
  displayCurrencyId?: string;
  displayCurrencyLabel?: string;
  categoryIds: number[];
  ingredientMaterialIds: number[];
  removableIngredientMaterialIds?: number[];
  ingredientAdditionals?: StoreProductAdditionalSummary[];
  imageUrls: string[];
  showOnShowcase: boolean;
  hasWeight?: boolean;
  weight?: number;
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

export type StoreAdminListPage<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

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

export function useStoreProductsPage(
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
    queryKey: [...storeProductsQueryKey(storeId), "page", safePage, safeLimit, q || null],
    queryFn: async (): Promise<StoreAdminListPage<StoreProductSummary>> => {
      const params = new URLSearchParams({
        page: String(safePage),
        limit: String(safeLimit),
      });
      if (q) params.set("q", q);
      const res = await fetch(`/api/stores/${storeId}/products?${params}`, {
        headers: authHeaders(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudieron cargar los productos");
      }
      const data = (await res.json()) as {
        products: StoreProductSummary[];
        total?: number;
        page?: number;
        limit?: number;
        totalPages?: number;
      };
      const total = data.total ?? data.products.length;
      const pageLimit = data.limit ?? safeLimit;
      return {
        items: data.products,
        total,
        page: data.page ?? safePage,
        limit: pageLimit,
        totalPages: data.totalPages ?? Math.max(1, Math.ceil(total / pageLimit)),
      };
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

export type IngredientsMaterialsPage = {
  items: IngredientMaterialItem[];
  total: number;
  page: number;
  limit: number;
  totalPages?: number;
};

async function fetchIngredientsMaterialsPage(options: {
  q?: string;
  page: number;
  limit?: number;
  /** Si hay texto de filtro, usa el endpoint de búsqueda dedicado. */
  useSearchEndpoint?: boolean;
}): Promise<IngredientsMaterialsPage> {
  const page = Math.max(1, options.page);
  const limit = options.limit ?? 20;
  const q = options.q?.trim() ?? "";
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  if (q) params.set("q", q);

  const path =
    options.useSearchEndpoint && q
      ? `/api/ingredients-materials/search?${params}`
      : `/api/ingredients-materials?${params}`;

  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(
      options.useSearchEndpoint && q
        ? "No se pudo buscar ingredientes y materiales"
        : "No se pudieron cargar ingredientes y materiales",
    );
  }
  return res.json() as Promise<IngredientsMaterialsPage>;
}

export function useIngredientsMaterials(
  search: string,
  page: number,
  enabled = true,
  limit = 20,
) {
  const q = search.trim();
  return useQuery({
    queryKey: ["/api/ingredients-materials", q || null, page, limit],
    queryFn: () =>
      fetchIngredientsMaterialsPage({
        q: q || undefined,
        page,
        limit,
        useSearchEndpoint: Boolean(q),
      }),
    enabled,
  });
}

export async function findIngredientMaterialByName(name: string): Promise<IngredientMaterialItem | null> {
  const key = ingredientMaterialKey(name);
  const data = await fetchIngredientsMaterialsPage({
    q: name.trim(),
    page: 1,
    limit: 50,
    useSearchEndpoint: true,
  }).catch(() => null);
  if (!data) return null;
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

function authIngredientHeaders(): HeadersInit {
  const token = localStorage.getItem("token");
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    "Content-Type": "application/json",
  };
}

export function useUpdateIngredientMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) => {
      const res = await fetch(`/api/ingredients-materials/${id}`, {
        method: "PUT",
        headers: authIngredientHeaders(),
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudo actualizar");
      }
      const data = (await res.json()) as { item: IngredientMaterialItem };
      return data.item;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["/api/ingredients-materials"] });
    },
  });
}

export function useDeleteIngredientMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/ingredients-materials/${id}`, {
        method: "DELETE",
        headers: authIngredientHeaders(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudo eliminar");
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["/api/ingredients-materials"] });
    },
  });
}

export function useCreateIngredientMaterialMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createIngredientMaterial(name),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["/api/ingredients-materials"] });
    },
  });
}
