import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  InsertStorePaymentMethod,
  UpdateStorePaymentMethod,
} from "@shared/store-payment-method-schema";

export type StorePaymentMethodSummary = {
  id: number;
  storeId: number;
  name: string;
  accountNumber: string;
  imageUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function storePaymentMethodsQueryKey(storeId: number) {
  return ["/api/stores", storeId, "payment-methods"] as const;
}

export function useStorePaymentMethods(storeId: number, enabled = true) {
  return useQuery({
    queryKey: storePaymentMethodsQueryKey(storeId),
    queryFn: async (): Promise<StorePaymentMethodSummary[]> => {
      const res = await fetch(`/api/stores/${storeId}/payment-methods`, { headers: authHeaders() });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudieron cargar los métodos de pago");
      }
      const data = (await res.json()) as { paymentMethods: StorePaymentMethodSummary[] };
      return data.paymentMethods;
    },
    enabled: enabled && storeId > 0,
  });
}

function invalidatePaymentMethods(qc: ReturnType<typeof useQueryClient>, storeId: number) {
  void qc.invalidateQueries({ queryKey: storePaymentMethodsQueryKey(storeId) });
}

export function useCreateStorePaymentMethod(storeId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: InsertStorePaymentMethod) => {
      const res = await fetch(`/api/stores/${storeId}/payment-methods`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudo crear el método de pago");
      }
      const data = (await res.json()) as { paymentMethod: StorePaymentMethodSummary };
      return data.paymentMethod;
    },
    onSuccess: () => invalidatePaymentMethods(qc, storeId),
  });
}

export function useUpdateStorePaymentMethod(storeId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      paymentMethodId,
      body,
    }: {
      paymentMethodId: number;
      body: UpdateStorePaymentMethod;
    }) => {
      const res = await fetch(`/api/stores/${storeId}/payment-methods/${paymentMethodId}`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudo actualizar el método de pago");
      }
      const data = (await res.json()) as { paymentMethod: StorePaymentMethodSummary };
      return data.paymentMethod;
    },
    onSuccess: () => invalidatePaymentMethods(qc, storeId),
  });
}

export function useDeleteStorePaymentMethod(storeId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (paymentMethodId: number) => {
      const res = await fetch(`/api/stores/${storeId}/payment-methods/${paymentMethodId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudo eliminar el método de pago");
      }
    },
    onSuccess: () => invalidatePaymentMethods(qc, storeId),
  });
}
