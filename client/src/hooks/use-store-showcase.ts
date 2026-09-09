import { keepPreviousData, useQuery } from "@tanstack/react-query";

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
  categoryIds: number[];
  subcategoryIds?: number[];
  ingredients?: StoreShowcaseIngredient[];
  removableIngredients?: StoreShowcaseIngredient[];
  additionals?: StoreShowcaseAdditional[];
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

export type StoreShowcaseResponse = {
  products: StoreShowcaseProduct[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
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

export const STORE_SHOWCASE_PAGE_SIZE = 10;

export type StoreShowcasePageFilters = {
  page?: number;
  limit?: number;
  search?: string;
  categoryId?: number | null;
  subcategoryId?: number | null;
};

export function storeShowcaseQueryKey(slug: string, filters?: StoreShowcasePageFilters) {
  return [
    "/api/stores",
    slug,
    "showcase-products",
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

export function useStoreShowcaseProducts(
  slug: string,
  enabled = true,
  filters: StoreShowcasePageFilters = {},
) {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.max(1, filters.limit ?? STORE_SHOWCASE_PAGE_SIZE);
  const search = (filters.search ?? "").trim();
  const categoryId =
    filters.categoryId != null && filters.categoryId > 0 ? filters.categoryId : null;
  const subcategoryId =
    filters.subcategoryId != null && filters.subcategoryId > 0 ? filters.subcategoryId : null;

  return useQuery({
    queryKey: storeShowcaseQueryKey(slug, {
      page,
      limit,
      search,
      categoryId,
      subcategoryId,
    }),
    queryFn: async (): Promise<StoreShowcaseResponse> => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (search) params.set("q", search);
      if (categoryId) params.set("categoryId", String(categoryId));
      if (subcategoryId) params.set("subcategoryId", String(subcategoryId));
      const res = await fetch(
        `/api/stores/${encodeURIComponent(slug)}/showcase-products?${params}`,
        { headers: showcaseAuthHeaders() },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudieron cargar los productos");
      }
      return res.json() as Promise<StoreShowcaseResponse>;
    },
    enabled: enabled && Boolean(slug),
    placeholderData: keepPreviousData,
  });
}

export function useStoreShowcaseProduct(slug: string, productId: number | null) {
  return useQuery({
    queryKey: ["/api/stores", slug, "showcase-products", "detail", productId] as const,
    queryFn: async (): Promise<StoreShowcaseProduct> => {
      const res = await fetch(
        `/api/stores/${encodeURIComponent(slug)}/showcase-products/${productId}`,
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

