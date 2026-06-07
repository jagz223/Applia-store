import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InsertStorePromotion, UpdateStorePromotion } from "@shared/store-schema";

export type StorePromotionItemSummary = {
  productId: number;
  productName: string;
  quantity: number;
  status: "active" | "inactive";
};

export type StorePromotionSummary = {
  id: number;
  storeId: number;
  name: string;
  description: string | null;
  price: number;
  status: "active" | "inactive";
  items: StorePromotionItemSummary[];
  createdAt: string;
  updatedAt: string;
};

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function storePromotionsQueryKey(storeId: number) {
  return ["/api/stores", storeId, "promotions"] as const;
}

export function useStorePromotions(storeId: number, enabled = true) {
  return useQuery({
    queryKey: storePromotionsQueryKey(storeId),
    queryFn: async (): Promise<StorePromotionSummary[]> => {
      const res = await fetch(`/api/stores/${storeId}/promotions`, { headers: authHeaders() });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudieron cargar las promociones");
      }
      const data = (await res.json()) as { promotions: StorePromotionSummary[] };
      return data.promotions;
    },
    enabled: enabled && storeId > 0,
  });
}

function invalidatePromotionQueries(qc: ReturnType<typeof useQueryClient>, storeId: number) {
  void qc.invalidateQueries({ queryKey: storePromotionsQueryKey(storeId) });
}

export function useCreateStorePromotion(storeId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: InsertStorePromotion) => {
      const res = await fetch(`/api/stores/${storeId}/promotions`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudo crear la promoción");
      }
      const data = (await res.json()) as { promotion: StorePromotionSummary };
      return data.promotion;
    },
    onSuccess: () => invalidatePromotionQueries(qc, storeId),
  });
}

export function useUpdateStorePromotion(storeId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ promotionId, body }: { promotionId: number; body: UpdateStorePromotion }) => {
      const res = await fetch(`/api/stores/${storeId}/promotions/${promotionId}`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudo actualizar la promoción");
      }
      const data = (await res.json()) as { promotion: StorePromotionSummary };
      return data.promotion;
    },
    onSuccess: () => invalidatePromotionQueries(qc, storeId),
  });
}

export function useDeleteStorePromotion(storeId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (promotionId: number) => {
      const res = await fetch(`/api/stores/${storeId}/promotions/${promotionId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudo eliminar la promoción");
      }
    },
    onSuccess: () => invalidatePromotionQueries(qc, storeId),
  });
}

export function promotionProductsFromItems(
  products: { id: number; name: string }[],
  items: StorePromotionItemSummary[],
): { id: number; name: string; quantity: number; status: "active" | "inactive" }[] {
  const nameById = new Map(products.map((p) => [p.id, p.name]));
  return items.map((item) => ({
    id: item.productId,
    name: item.productName || nameById.get(item.productId) || `Producto #${item.productId}`,
    quantity: item.quantity,
    status: item.status,
  }));
}
