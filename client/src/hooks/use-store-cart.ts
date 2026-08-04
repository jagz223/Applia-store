import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AddStoreCartItem,
  RemoveStoreCartItem,
  UpdateStoreCartFulfillment,
  UpdateStoreCartItem,
} from "@shared/store-cart-schema";
import type { SubmitStoreCheckout } from "@shared/store-order-schema";
import type { StoreFulfillmentMode } from "@shared/store-fulfillment";
import type { StoreLocation, StoreDeliveryFares } from "@shared/store-schema";

export type StoreCartLine = {
  kind: "product" | "promotion";
  lineKey: string;
  productId?: number;
  promotionId?: number;
  name: string;
  price: number;
  quantity: number;
  lineTotal: number;
  imageUrl: string | null;
  removedIngredientMaterialIds?: number[];
  additionalIngredientMaterialIds?: number[];
};

export type StoreCartFulfillmentOption = {
  mode: StoreFulfillmentMode;
  label: string;
};

export type StoreCartPaymentMethodOption = {
  id: number;
  name: string;
  accountNumber: string;
  extraFields?: Array<{ name: string; value: string }>;
  imageUrl: string | null;
};

export type StoreCartSummary = {
  storeId: number;
  items: StoreCartLine[];
  subtotal: number;
  itemCount: number;
  expiresAt: string | null;
  fulfillmentMode: StoreFulfillmentMode | null;
  fulfillmentOptions: StoreCartFulfillmentOption[];
  paymentMethods: StoreCartPaymentMethodOption[];
  storeLocation: StoreLocation | null;
  deliveryFares: StoreDeliveryFares;
};

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function storeCartQueryKey(storeId: number) {
  return ["/api/stores", storeId, "cart"] as const;
}

export function useStoreCart(storeId: number, enabled = true) {
  return useQuery({
    queryKey: storeCartQueryKey(storeId),
    queryFn: async (): Promise<StoreCartSummary> => {
      const res = await fetch(`/api/stores/${storeId}/cart`, { headers: authHeaders() });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudo cargar el carrito");
      }
      const data = (await res.json()) as { cart: StoreCartSummary };
      return data.cart;
    },
    enabled: enabled && storeId > 0,
  });
}

function invalidateCart(qc: ReturnType<typeof useQueryClient>, storeId: number) {
  void qc.invalidateQueries({ queryKey: storeCartQueryKey(storeId) });
}

export function useAddToStoreCart(storeId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: AddStoreCartItem) => {
      const res = await fetch(`/api/stores/${storeId}/cart/items`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudo añadir al carrito");
      }
      const data = (await res.json()) as { cart: StoreCartSummary };
      return data.cart;
    },
    onSuccess: () => invalidateCart(qc, storeId),
  });
}

export function useUpdateStoreCartItem(storeId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpdateStoreCartItem) => {
      const res = await fetch(`/api/stores/${storeId}/cart/items`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudo actualizar el carrito");
      }
      const data = (await res.json()) as { cart: StoreCartSummary };
      return data.cart;
    },
    onSuccess: () => invalidateCart(qc, storeId),
  });
}

export function useSubmitStoreCheckout(storeId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: SubmitStoreCheckout) => {
      const res = await fetch(`/api/stores/${storeId}/cart/checkout`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudo confirmar la compra");
      }
      return res.json();
    },
    onSuccess: () => invalidateCart(qc, storeId),
  });
}

export function useRemoveFromStoreCart(storeId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: RemoveStoreCartItem) => {
      const res = await fetch(`/api/stores/${storeId}/cart/items`, {
        method: "DELETE",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudo quitar del carrito");
      }
      const data = (await res.json()) as { cart: StoreCartSummary };
      return data.cart;
    },
    onSuccess: () => invalidateCart(qc, storeId),
  });
}

export function useUpdateStoreCartFulfillment(storeId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpdateStoreCartFulfillment) => {
      const res = await fetch(`/api/stores/${storeId}/cart/fulfillment`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudo actualizar la entrega");
      }
      const data = (await res.json()) as { cart: StoreCartSummary };
      return data.cart;
    },
    onSuccess: () => invalidateCart(qc, storeId),
  });
}
