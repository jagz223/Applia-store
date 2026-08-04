import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BcvCurrencyRate, StoreCurrencyExtra } from "@shared/store-currency-schema";
import { STORE_CURRENCY_USD_ID } from "@shared/store-currency-schema";
import { MY_STORE_QUERY_KEY } from "@/hooks/use-my-store";

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type BcvRatesResponse = {
  source: string;
  provider: string;
  dollar: BcvCurrencyRate;
  euro: BcvCurrencyRate;
};

export type StoreCurrencySettings = {
  currencyExtras: StoreCurrencyExtra[];
  currencyVisualId: string;
  currencyAcceptedPaymentIds: string[];
};

export function bcvRatesQueryKey() {
  return ["/api/currency/bcv"] as const;
}

export function useBcvRates(enabled = true) {
  return useQuery({
    queryKey: bcvRatesQueryKey(),
    queryFn: async (): Promise<BcvRatesResponse> => {
      const res = await fetch("/api/currency/bcv");
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudieron cargar las tasas BCV");
      }
      return (await res.json()) as BcvRatesResponse;
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
  });
}

export function useUpdateStoreCurrencySettings(storeId: number, slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      currencyExtras: StoreCurrencyExtra[];
      currencyVisualId: string;
      currencyAcceptedPaymentIds: string[];
    }) => {
      const res = await fetch(`/api/stores/${storeId}`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudieron guardar las tasas");
      }
      const data = (await res.json()) as { store: Partial<StoreCurrencySettings> };
      return {
        currencyExtras: data.store.currencyExtras ?? body.currencyExtras,
        currencyVisualId: data.store.currencyVisualId ?? body.currencyVisualId ?? STORE_CURRENCY_USD_ID,
        currencyAcceptedPaymentIds:
          data.store.currencyAcceptedPaymentIds ??
          body.currencyAcceptedPaymentIds ??
          [STORE_CURRENCY_USD_ID],
      } satisfies StoreCurrencySettings;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: MY_STORE_QUERY_KEY });
      void qc.invalidateQueries({ queryKey: ["/api/stores", slug] });
      void qc.invalidateQueries({ queryKey: ["/api/stores"] });
    },
  });
}
