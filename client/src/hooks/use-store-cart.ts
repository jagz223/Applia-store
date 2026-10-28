import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AddStoreCartItem,
  RemoveStoreCartItem,
  UpdateStoreCartFulfillment,
  UpdateStoreCartItem,
} from "@shared/store-cart-schema";
import type { SubmitStoreCheckout } from "@shared/store-order-schema";
import type { StoreFulfillmentMode } from "@shared/store-fulfillment";
import type {
  StoreBranch,
  StoreLocation,
  StoreDeliveryFares,
  StoreProductCatalogKind,
} from "@shared/store-schema";
import { parseStoreProductCatalogKind } from "@shared/store-schema";
import type { StoreCurrencyExtra } from "@shared/store-currency-schema";

export type StoreCartLine = {
  kind: "product" | "promotion";
  lineKey: string;
  productId?: number;
  promotionId?: number;
  sizeId?: string | null;
  name: string;
  price: number;
  quantity: number;
  lineTotal: number;
  imageUrl: string | null;
  secondaryImageUrl?: string | null;
  removedIngredientMaterialIds?: number[];
  additionalIngredientMaterialIds?: number[];
  boxSize?: number;
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
  isCashea?: boolean;
  gatewayKind?: "stripe" | "paypal" | "dlocalgo" | null;
};

export type StoreCartSummary = {
  storeId: number;
  storeName?: string | null;
  whatsappPhone?: string | null;
  items: StoreCartLine[];
  subtotal: number;
  itemCount: number;
  cartWeightKg: number;
  expiresAt: string | null;
  fulfillmentMode: StoreFulfillmentMode | null;
  fulfillmentOptions: StoreCartFulfillmentOption[];
  paymentMethods: StoreCartPaymentMethodOption[];
  storeLocation: StoreLocation | null;
  branches: StoreBranch[];
  deliveryFares: StoreDeliveryFares;
  currencyVisualId?: string;
  currencyExtras?: StoreCurrencyExtra[];
  cartKind?: StoreProductCatalogKind;
};

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function withCartKind(
  body: Record<string, unknown> | undefined,
  cartKind: StoreProductCatalogKind,
): Record<string, unknown> {
  return { ...(body ?? {}), cartKind };
}

function cartKindQuery(cartKind: StoreProductCatalogKind): string {
  return `?cartKind=${encodeURIComponent(cartKind)}`;
}

export function storeCartQueryKey(
  storeId: number,
  cartKind: StoreProductCatalogKind = "retail",
) {
  return ["/api/stores", storeId, "cart", parseStoreProductCatalogKind(cartKind)] as const;
}

export function useStoreCart(
  storeId: number,
  enabled = true,
  cartKind: StoreProductCatalogKind = "retail",
) {
  const kind = parseStoreProductCatalogKind(cartKind);
  return useQuery({
    queryKey: storeCartQueryKey(storeId, kind),
    queryFn: async (): Promise<StoreCartSummary> => {
      const res = await fetch(`/api/stores/${storeId}/cart${cartKindQuery(kind)}`, {
        headers: authHeaders(),
      });
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

function cacheCart(
  qc: ReturnType<typeof useQueryClient>,
  storeId: number,
  cart: StoreCartSummary,
  cartKind: StoreProductCatalogKind = "retail",
) {
  qc.setQueryData(storeCartQueryKey(storeId, cartKind), cart);
}

function applyOptimisticQuantity(
  cart: StoreCartSummary,
  body: UpdateStoreCartItem,
): StoreCartSummary {
  const key =
    body.lineKey?.trim() ||
    (body.kind === "promotion"
      ? `m:${body.promotionId}`
      : body.productId
        ? `p-${body.productId}`
        : "");
  if (!key) return cart;
  const items =
    body.quantity <= 0
      ? cart.items.filter((line) => (line.lineKey || "") !== key && cartLineFallbackKey(line) !== key)
      : cart.items.map((line) => {
          const lineKey = line.lineKey || cartLineFallbackKey(line);
          if (lineKey !== key && line.lineKey !== body.lineKey) return line;
          return {
            ...line,
            quantity: body.quantity,
            lineTotal: line.price * body.quantity,
          };
        });
  const itemCount = items.reduce((sum, line) => sum + line.quantity, 0);
  const subtotal = items.reduce((sum, line) => sum + line.lineTotal, 0);
  return { ...cart, items, itemCount, subtotal };
}

function cartLineFallbackKey(line: StoreCartLine) {
  return line.kind === "product" ? `p-${line.productId}` : `m-${line.promotionId}`;
}

export function useAddToStoreCart(
  storeId: number,
  cartKind: StoreProductCatalogKind = "retail",
) {
  const qc = useQueryClient();
  const kind = parseStoreProductCatalogKind(cartKind);
  return useMutation({
    mutationFn: async (body: AddStoreCartItem) => {
      const res = await fetch(`/api/stores/${storeId}/cart/items`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(withCartKind(body as unknown as Record<string, unknown>, kind)),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudo añadir al carrito");
      }
      const data = (await res.json()) as { cart: StoreCartSummary };
      return data.cart;
    },
    onSuccess: (cart) => cacheCart(qc, storeId, cart, kind),
  });
}

export function useUpdateStoreCartItem(
  storeId: number,
  cartKind: StoreProductCatalogKind = "retail",
) {
  const qc = useQueryClient();
  const kind = parseStoreProductCatalogKind(cartKind);
  return useMutation({
    mutationFn: async (body: UpdateStoreCartItem) => {
      const res = await fetch(`/api/stores/${storeId}/cart/items`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(withCartKind(body as unknown as Record<string, unknown>, kind)),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudo actualizar el carrito");
      }
      const data = (await res.json()) as { cart: StoreCartSummary };
      return data.cart;
    },
    onMutate: async (body) => {
      const key = storeCartQueryKey(storeId, kind);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<StoreCartSummary>(key);
      if (previous) {
        qc.setQueryData(key, applyOptimisticQuantity(previous, body));
      }
      return { previous };
    },
    onError: (_err, _body, ctx) => {
      if (ctx?.previous) cacheCart(qc, storeId, ctx.previous, kind);
    },
    onSuccess: (cart) => cacheCart(qc, storeId, cart, kind),
  });
}

export function useSubmitStoreCheckout(
  storeId: number,
  cartKind: StoreProductCatalogKind = "retail",
) {
  const qc = useQueryClient();
  const kind = parseStoreProductCatalogKind(cartKind);
  return useMutation({
    mutationFn: async (body: SubmitStoreCheckout) => {
      const res = await fetch(`/api/stores/${storeId}/cart/checkout`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(withCartKind(body as unknown as Record<string, unknown>, kind)),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudo confirmar la compra");
      }
      return res.json() as Promise<{
        order?: { id: number } | null;
        checkoutUrl?: string | null;
        gatewayKind?: "stripe" | "paypal" | "dlocalgo" | null;
      }>;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: storeCartQueryKey(storeId, kind) });
    },
  });
}

export function useRemoveFromStoreCart(
  storeId: number,
  cartKind: StoreProductCatalogKind = "retail",
) {
  const qc = useQueryClient();
  const kind = parseStoreProductCatalogKind(cartKind);
  return useMutation({
    mutationFn: async (body: RemoveStoreCartItem) => {
      const res = await fetch(`/api/stores/${storeId}/cart/items`, {
        method: "DELETE",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(withCartKind(body as unknown as Record<string, unknown>, kind)),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudo quitar del carrito");
      }
      const data = (await res.json()) as { cart: StoreCartSummary };
      return data.cart;
    },
    onSuccess: (cart) => cacheCart(qc, storeId, cart, kind),
  });
}

export function useUpdateStoreCartFulfillment(
  storeId: number,
  cartKind: StoreProductCatalogKind = "retail",
) {
  const qc = useQueryClient();
  const kind = parseStoreProductCatalogKind(cartKind);
  return useMutation({
    mutationFn: async (body: UpdateStoreCartFulfillment) => {
      const res = await fetch(`/api/stores/${storeId}/cart/fulfillment`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(withCartKind(body as unknown as Record<string, unknown>, kind)),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudo actualizar la entrega");
      }
      const data = (await res.json()) as { cart: StoreCartSummary };
      return data.cart;
    },
    onSuccess: (cart) => cacheCart(qc, storeId, cart, kind),
  });
}
