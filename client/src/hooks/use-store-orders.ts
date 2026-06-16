import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { StoreFulfillmentMode } from "@shared/store-fulfillment";
import type { StoreLocation } from "@shared/store-schema";
import type { StoreOrderDeliveryLocation, StoreOrderLineItem, StoreOrderStatus } from "@shared/store-order-schema";

export type StoreOrderSummary = {
  id: number;
  storeId: number;
  storeName: string | null;
  storeSlug: string | null;
  userId: string;
  customerName: string | null;
  customerEmail: string | null;
  paymentMethodId: number;
  paymentMethodName: string;
  paymentMethodAccountNumber: string;
  fulfillmentMode: StoreFulfillmentMode | null;
  fulfillmentLabel: string;
  reference: string;
  proofImageUrl: string;
  amountDue: number;
  amountPaid: number;
  deliveryFee: number;
  deliveryDistanceM: number | null;
  subtotal: number;
  deliveryLocation: StoreOrderDeliveryLocation | null;
  items: StoreOrderLineItem[];
  status: StoreOrderStatus;
  statusLabel: string;
  packRideId: string | null;
  deliveryUnreadCount: number;
  createdAt: string | null;
  updatedAt: string | null;
};

export type StoreOrderDetail = StoreOrderSummary & {
  storeLocation: StoreLocation | null;
  allowedNextStatuses: { status: StoreOrderStatus; label: string }[];
};

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type StoreOrderListFilters = {
  status?: string;
  orderId?: string;
  dateFrom?: string;
  dateTo?: string;
  deliveryQueue?: boolean;
};

export function storeOrdersQueryKey(storeId: number, filters?: StoreOrderListFilters) {
  return ["/api/stores", storeId, "orders", filters ?? {}] as const;
}

export function storeOrderDetailQueryKey(storeId: number, orderId: number) {
  return ["/api/stores", storeId, "orders", orderId] as const;
}

export function useStoreOrders(storeId: number, filters?: StoreOrderListFilters, enabled = true) {
  return useQuery({
    queryKey: storeOrdersQueryKey(storeId, filters),
    queryFn: async (): Promise<StoreOrderSummary[]> => {
      const params = new URLSearchParams();
      if (filters?.status?.trim()) params.set("status", filters.status.trim());
      if (filters?.orderId?.trim()) params.set("orderId", filters.orderId.trim());
      if (filters?.dateFrom?.trim()) params.set("dateFrom", filters.dateFrom.trim());
      if (filters?.dateTo?.trim()) params.set("dateTo", filters.dateTo.trim());
      if (filters?.deliveryQueue) params.set("deliveryQueue", "true");
      const qs = params.toString();
      const res = await fetch(`/api/stores/${storeId}/orders${qs ? `?${qs}` : ""}`, {
        headers: authHeaders(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudieron cargar las órdenes");
      }
      const data = (await res.json()) as { orders: StoreOrderSummary[] };
      return data.orders;
    },
    enabled: enabled && storeId > 0,
  });
}

export function useStoreOrderDetail(storeId: number, orderId: number | null, enabled = true) {
  return useQuery({
    queryKey: storeOrderDetailQueryKey(storeId, orderId ?? 0),
    queryFn: async (): Promise<StoreOrderDetail> => {
      const res = await fetch(`/api/stores/${storeId}/orders/${orderId}`, { headers: authHeaders() });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudo cargar la orden");
      }
      const data = (await res.json()) as { order: StoreOrderDetail };
      return data.order;
    },
    enabled: enabled && storeId > 0 && orderId != null && orderId > 0,
  });
}

export type StoreDeliveryNotificationsSummary = {
  totalUnread: number;
  byOrderId: Record<number, number>;
};

export type StoreOrderPackRideDetail = {
  id: string;
  status: string;
  driverUserId: string | null;
  conversationId: number | null;
  estimatedUsd: number;
  distanceM: number;
  durationSec: number;
  start: { lat: number; lon: number; label: string };
  end: { lat: number; lon: number; label: string };
  driver: {
    userId: string;
    name: string;
    lastName?: string;
    profileImageUrl: string | null;
    phone: string | null;
    vehicle: {
      type: string;
      brand: string;
      model: string;
      licensePlate: string;
      color: string | null;
    } | null;
  } | null;
  ratedByRider?: boolean;
  ratedByDriver?: boolean;
};

export function storeDeliveryNotificationsKey(storeId: number) {
  return ["/api/stores", storeId, "orders", "delivery-notifications"] as const;
}

export function useStoreDeliveryNotifications(storeId: number, enabled = true) {
  return useQuery({
    queryKey: storeDeliveryNotificationsKey(storeId),
    queryFn: async (): Promise<StoreDeliveryNotificationsSummary> => {
      const res = await fetch(`/api/stores/${storeId}/orders/delivery-notifications`, {
        headers: authHeaders(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudieron cargar las notificaciones");
      }
      return (await res.json()) as StoreDeliveryNotificationsSummary;
    },
    enabled: enabled && storeId > 0,
    refetchInterval: 20_000,
  });
}

export function useStoreOrderDeliveryDetail(storeId: number, orderId: number, enabled = true) {
  return useQuery({
    queryKey: ["/api/stores", storeId, "orders", orderId, "delivery"] as const,
    queryFn: async (): Promise<{ order: StoreOrderDetail; packRide: StoreOrderPackRideDetail | null }> => {
      const res = await fetch(`/api/stores/${storeId}/orders/${orderId}/delivery`, {
        headers: authHeaders(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudo cargar el delivery");
      }
      return (await res.json()) as { order: StoreOrderDetail; packRide: StoreOrderPackRideDetail | null };
    },
    enabled: enabled && storeId > 0 && orderId > 0,
    refetchInterval: 15_000,
  });
}

export function useUpdateStoreOrderStatus(storeId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, status }: { orderId: number; status: StoreOrderStatus }) => {
      const res = await fetch(`/api/stores/${storeId}/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudo actualizar el estado");
      }
      const data = (await res.json()) as { order: StoreOrderDetail };
      return data.order;
    },
    onSuccess: (order) => {
      void qc.invalidateQueries({ queryKey: ["/api/stores", storeId, "orders"] });
      void qc.invalidateQueries({ queryKey: storeDeliveryNotificationsKey(storeId) });
      void qc.invalidateQueries({ queryKey: storeOrderDetailQueryKey(storeId, order.id) });
    },
  });
}

export type MyStoreOrderListFilters = StoreOrderListFilters & {
  storeId?: string;
};

export function myStoreOrdersQueryKey(filters?: MyStoreOrderListFilters) {
  return ["/api/me/store-orders", filters ?? {}] as const;
}

export function myStoreOrderDetailQueryKey(orderId: number) {
  return ["/api/me/store-orders", orderId] as const;
}

export function useMyStoreOrders(filters?: MyStoreOrderListFilters, enabled = true) {
  return useQuery({
    queryKey: myStoreOrdersQueryKey(filters),
    queryFn: async (): Promise<StoreOrderSummary[]> => {
      const params = new URLSearchParams();
      if (filters?.status?.trim()) params.set("status", filters.status.trim());
      if (filters?.orderId?.trim()) params.set("orderId", filters.orderId.trim());
      if (filters?.storeId?.trim()) params.set("storeId", filters.storeId.trim());
      if (filters?.dateFrom?.trim()) params.set("dateFrom", filters.dateFrom.trim());
      if (filters?.dateTo?.trim()) params.set("dateTo", filters.dateTo.trim());
      const qs = params.toString();
      const res = await fetch(`/api/me/store-orders${qs ? `?${qs}` : ""}`, {
        headers: authHeaders(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudieron cargar tus pedidos");
      }
      const data = (await res.json()) as { orders: StoreOrderSummary[] };
      return data.orders;
    },
    enabled,
  });
}

export type MyStoreOrderDetail = StoreOrderSummary & {
  storeLocation: StoreLocation | null;
};

export function useMyStoreOrderDetail(orderId: number | null, enabled = true) {
  return useQuery({
    queryKey: myStoreOrderDetailQueryKey(orderId ?? 0),
    queryFn: async (): Promise<MyStoreOrderDetail> => {
      const res = await fetch(`/api/me/store-orders/${orderId}`, { headers: authHeaders() });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudo cargar el pedido");
      }
      const data = (await res.json()) as { order: MyStoreOrderDetail };
      return data.order;
    },
    enabled: enabled && orderId != null && orderId > 0,
  });
}
