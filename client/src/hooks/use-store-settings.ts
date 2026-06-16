import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { UpdateStore, StoreLocation } from "@shared/store-schema";
import { MY_STORE_QUERY_KEY } from "@/hooks/use-my-store";

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function useUpdateStore(slug: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (body: UpdateStore) => {
      const res = await fetch("/api/stores/mine", {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudo actualizar la tienda");
      }
      const data = (await res.json()) as {
        store: {
          coverImageUrl?: string | null;
          name?: string;
          description?: string | null;
          rubro?: string | null;
          rubroLabel?: string | null;
          slug?: string;
          fulfillmentOptions?: import("@shared/store-fulfillment").StoreFulfillmentMode[];
          location?: StoreLocation | null;
        };
      };
      return data.store;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: MY_STORE_QUERY_KEY });
      void qc.invalidateQueries({ queryKey: ["/api/stores", slug] });
      void qc.invalidateQueries({ queryKey: ["/api/stores"] });
    },
  });
}
