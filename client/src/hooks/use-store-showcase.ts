import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  parseStoreProductCatalogKind,
  type StoreProductCatalogKind,
} from "@shared/store-schema";

export type StoreShowcaseIngredient = {
  id: number;
  name: string;
};

export type StoreShowcaseAdditional = {
  id: number;
  name: string;
  price: number;
  pricesByCurrency?: Record<string, number>;
  pricesBySize?: Record<string, Record<string, number>>;
};

export type StoreShowcaseSize = {
  id: string;
  name: string;
  price: number;
  pricesByCurrency?: Record<string, number>;
};

export type StoreShowcaseProduct = {
  id: number;
  name: string;
  description: string | null;
  price: number;
  pricesByCurrency?: Record<string, number>;
  sizes?: StoreShowcaseSize[];
  displayCurrencyId?: string;
  displayCurrencyLabel?: string;
  imageUrls: string[];
  categoryIds?: number[];
  subcategoryIds?: number[];
  ingredients?: StoreShowcaseIngredient[];
  removableIngredients?: StoreShowcaseIngredient[];
  additionals?: StoreShowcaseAdditional[];
  /** Metros por caja; > 0 si se vende por caja. */
  boxSize?: number;
};

export type StoreShowcaseCategory = {
  id: number;
  name: string;
  hideFromShowcaseAll?: boolean;
  sortOrder?: number;
};

export type StoreShowcaseSubcategory = {
  id: number;
  categoryId: number;
  name: string;
};

export type StoreShowcaseAd = {
  id: number;
  storeId: number;
  kind: "banner" | "popup";
  imageUrl: string | null | undefined;
  linkUrl: string | null | undefined;
  sortOrder: number;
  categoryVisibilityMode?: "all" | "exclude" | "include";
  categoryIds?: number[];
};

export type StoreShowcasePromotionItem = {
  productId: number;
  productName: string;
  quantity: number;
};

export type StoreShowcasePromotion = {
  id: number;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  promotionImageUrl?: string | null;
  items: StoreShowcasePromotionItem[];
};

export type StoreShowcaseMetaResponse = {
  catalogTotal: number;
  categories: StoreShowcaseCategory[];
  subcategories?: StoreShowcaseSubcategory[];
  promotions: StoreShowcasePromotion[];
  banners?: StoreShowcaseAd[];
  popups?: StoreShowcaseAd[];
  visibilityActive: boolean;
  inactive?: boolean;
  isOwner?: boolean;
};

export type StoreShowcaseProductsResponse = {
  products: StoreShowcaseProduct[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  catalogTotal: number;
};

/** Compat: meta + products merged for callers that still expect one shape. */
export type StoreShowcaseResponse = StoreShowcaseMetaResponse & StoreShowcaseProductsResponse;

export const STORE_SHOWCASE_PAGE_SIZE = 10;

/** Mantener páginas prefetchadas un rato más que el default de React Query. */
const STORE_SHOWCASE_PRODUCTS_GC_MS = 15 * 60 * 1000;

export type StoreShowcasePageFilters = {
  page?: number;
  limit?: number;
  search?: string;
  categoryId?: number | null;
  subcategoryId?: number | null;
  catalogKind?: StoreProductCatalogKind;
};

export function storeShowcaseMetaQueryKey(
  slug: string,
  catalogKind: StoreProductCatalogKind = "retail",
) {
  return ["/api/stores", slug, "showcase-meta", parseStoreProductCatalogKind(catalogKind)] as const;
}

export function storeShowcaseQueryKey(slug: string, filters?: StoreShowcasePageFilters) {
  return [
    "/api/stores",
    slug,
    "showcase-products",
    parseStoreProductCatalogKind(filters?.catalogKind),
    filters?.page ?? 1,
    filters?.limit ?? STORE_SHOWCASE_PAGE_SIZE,
    filters?.search?.trim() || null,
    filters?.categoryId ?? null,
    filters?.subcategoryId ?? null,
  ] as const;
}

function showcaseAuthHeaders(): HeadersInit {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchStoreShowcaseProducts(
  slug: string,
  filters: Required<
    Pick<StoreShowcasePageFilters, "page" | "limit">
  > & {
    search: string;
    categoryId: number | null;
    subcategoryId: number | null;
    catalogKind: StoreProductCatalogKind;
  },
): Promise<StoreShowcaseProductsResponse> {
  const params = new URLSearchParams({
    page: String(filters.page),
    limit: String(filters.limit),
    catalog: filters.catalogKind,
  });
  if (filters.search) params.set("q", filters.search);
  if (filters.categoryId) params.set("categoryId", String(filters.categoryId));
  if (filters.subcategoryId) params.set("subcategoryId", String(filters.subcategoryId));
  const res = await fetch(
    `/api/stores/${encodeURIComponent(slug)}/showcase-products?${params}`,
    { headers: showcaseAuthHeaders() },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message ?? "No se pudieron cargar los productos");
  }
  return res.json() as Promise<StoreShowcaseProductsResponse>;
}

export function useStoreShowcaseMeta(
  slug: string,
  enabled = true,
  catalogKind: StoreProductCatalogKind = "retail",
) {
  const kind = parseStoreProductCatalogKind(catalogKind);
  return useQuery({
    queryKey: storeShowcaseMetaQueryKey(slug, kind),
    queryFn: async (): Promise<StoreShowcaseMetaResponse> => {
      const params = new URLSearchParams({ catalog: kind });
      const res = await fetch(
        `/api/stores/${encodeURIComponent(slug)}/showcase-meta?${params}`,
        { headers: showcaseAuthHeaders() },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudo cargar la vitrina");
      }
      return res.json() as Promise<StoreShowcaseMetaResponse>;
    },
    enabled: enabled && Boolean(slug),
  });
}

export function useStoreShowcaseProducts(
  slug: string,
  enabled = true,
  filters: StoreShowcasePageFilters = {},
) {
  const qc = useQueryClient();
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.max(1, filters.limit ?? STORE_SHOWCASE_PAGE_SIZE);
  const search = (filters.search ?? "").trim();
  const categoryId =
    filters.categoryId != null && filters.categoryId > 0 ? filters.categoryId : null;
  const subcategoryId =
    filters.subcategoryId != null && filters.subcategoryId > 0 ? filters.subcategoryId : null;
  const catalogKind = parseStoreProductCatalogKind(filters.catalogKind);
  const resolvedFilters = { page, limit, search, categoryId, subcategoryId, catalogKind };
  const queryEnabled = enabled && Boolean(slug);

  const query = useQuery({
    queryKey: storeShowcaseQueryKey(slug, resolvedFilters),
    queryFn: () => fetchStoreShowcaseProducts(slug, resolvedFilters),
    enabled: queryEnabled,
    placeholderData: keepPreviousData,
    gcTime: STORE_SHOWCASE_PRODUCTS_GC_MS,
  });

  useEffect(() => {
    if (!queryEnabled || !query.data) return;
    const totalPages = Math.max(1, query.data.totalPages ?? 1);
    const neighbors = [page + 1, page - 1].filter((p) => p >= 1 && p <= totalPages);
    for (const nextPage of neighbors) {
      void qc.prefetchQuery({
        queryKey: storeShowcaseQueryKey(slug, {
          page: nextPage,
          limit,
          search,
          categoryId,
          subcategoryId,
          catalogKind,
        }),
        queryFn: () =>
          fetchStoreShowcaseProducts(slug, {
            page: nextPage,
            limit,
            search,
            categoryId,
            subcategoryId,
            catalogKind,
          }),
        gcTime: STORE_SHOWCASE_PRODUCTS_GC_MS,
      });
    }
  }, [
    queryEnabled,
    query.data,
    page,
    limit,
    search,
    categoryId,
    subcategoryId,
    catalogKind,
    slug,
    qc,
  ]);

  return query;
}

export function useStoreShowcaseProduct(
  slug: string,
  productId: number | null,
  catalogKind: StoreProductCatalogKind = "retail",
) {
  const kind = parseStoreProductCatalogKind(catalogKind);
  return useQuery({
    queryKey: ["/api/stores", slug, "showcase-products", "detail", kind, productId] as const,
    queryFn: async (): Promise<StoreShowcaseProduct> => {
      const params = new URLSearchParams({ catalog: kind });
      const res = await fetch(
        `/api/stores/${encodeURIComponent(slug)}/showcase-products/${productId}?${params}`,
        { headers: showcaseAuthHeaders() },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudo cargar el producto");
      }
      const data = (await res.json()) as { product: StoreShowcaseProduct };
      return data.product;
    },
    enabled: Boolean(slug) && productId != null && productId > 0,
  });
}
