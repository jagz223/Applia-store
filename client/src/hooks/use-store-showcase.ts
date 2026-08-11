import { useQuery } from "@tanstack/react-query";

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
  ingredients?: StoreShowcaseIngredient[];
  removableIngredients?: StoreShowcaseIngredient[];
  additionals?: StoreShowcaseAdditional[];
};

export type StoreShowcaseCategory = {
  id: number;
  name: string;
  hideFromShowcaseAll?: boolean;
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
  categories: StoreShowcaseCategory[];
  promotions: StoreShowcasePromotion[];
  visibilityActive: boolean;
  inactive?: boolean;
  isOwner?: boolean;
};

export function storeShowcaseQueryKey(slug: string) {
  return ["/api/stores", slug, "showcase-products"] as const;
}

export function useStoreShowcaseProducts(slug: string, enabled = true) {
  return useQuery({
    queryKey: storeShowcaseQueryKey(slug),
    queryFn: async (): Promise<StoreShowcaseResponse> => {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/stores/${encodeURIComponent(slug)}/showcase-products`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudieron cargar los productos");
      }
      return res.json() as Promise<StoreShowcaseResponse>;
    },
    enabled: enabled && Boolean(slug),
  });
}
