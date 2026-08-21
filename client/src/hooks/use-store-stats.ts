import { useQuery } from "@tanstack/react-query";

import type {
  StoreStatsPeriod,
  StoreStatsProductRankMode,
  StoreStatsResponse,
  StoreStatsStatusScope,
} from "@shared/store-stats-schema";

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type StoreStatsFilters = {
  period: StoreStatsPeriod;
  branchId: string | null;
  productRankMode: StoreStatsProductRankMode;
  statusScope: StoreStatsStatusScope;
};

export function storeStatsQueryKey(storeId: number, filters: StoreStatsFilters) {
  return [
    "/api/stores",
    storeId,
    "stats",
    filters.period,
    filters.branchId ?? "",
    filters.productRankMode,
    filters.statusScope,
  ] as const;
}

export function useStoreStats(storeId: number, filters: StoreStatsFilters, enabled = true) {
  return useQuery({
    queryKey: storeStatsQueryKey(storeId, filters),
    queryFn: async (): Promise<StoreStatsResponse> => {
      const params = new URLSearchParams();
      params.set("period", filters.period);
      if (filters.branchId) params.set("branchId", filters.branchId);
      params.set("productRankMode", filters.productRankMode);
      params.set("statusScope", filters.statusScope);

      const res = await fetch(`/api/stores/${storeId}/stats?${params.toString()}`, {
        headers: authHeaders(),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudieron cargar las estadísticas");
      }

      const data = (await res.json()) as { stats: StoreStatsResponse };
      return data.stats;
    },
    enabled: enabled && storeId > 0,
  });
}

