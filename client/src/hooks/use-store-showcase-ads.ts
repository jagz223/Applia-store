import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InsertStoreShowcaseAdItem } from "@shared/store-showcase-ads-schema";

export type StoreShowcaseAdSummary = {
  id: number;
  storeId: number;
  kind: "banner" | "popup";
  imageUrl: string | null;
  linkUrl: string | null;
  sortOrder: number;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type StoreShowcaseAdsResponse = {
  banners: StoreShowcaseAdSummary[];
  popups: StoreShowcaseAdSummary[];
};

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function storeShowcaseAdsQueryKey(storeId: number) {
  return ["/api/stores", storeId, "showcase-ads"] as const;
}

export function useStoreShowcaseAds(storeId: number, enabled = true) {
  return useQuery({
    queryKey: storeShowcaseAdsQueryKey(storeId),
    queryFn: async (): Promise<StoreShowcaseAdsResponse> => {
      const res = await fetch(`/api/stores/${storeId}/showcase-ads`, { headers: authHeaders() });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudieron cargar los banners y popups");
      }
      return (await res.json()) as StoreShowcaseAdsResponse;
    },
    enabled: enabled && storeId > 0,
  });
}

function invalidateStoreShowcaseAds(qc: ReturnType<typeof useQueryClient>, storeId: number) {
  void qc.invalidateQueries({ queryKey: storeShowcaseAdsQueryKey(storeId) });
}

export function useCreateStoreShowcaseAd(storeId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: InsertStoreShowcaseAdItem) => {
      const res = await fetch(`/api/stores/${storeId}/showcase-ads`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudo crear el banner o popup");
      }
      const data = (await res.json()) as { item: StoreShowcaseAdSummary };
      return data.item;
    },
    onSuccess: () => invalidateStoreShowcaseAds(qc, storeId),
  });
}

export function useDeleteStoreShowcaseAd(storeId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ kind, adId }: { kind: "banner" | "popup"; adId: number }) => {
      const res = await fetch(`/api/stores/${storeId}/showcase-ads/${kind}/${adId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudo eliminar el banner o popup");
      }
    },
    onSuccess: () => invalidateStoreShowcaseAds(qc, storeId),
  });
}

