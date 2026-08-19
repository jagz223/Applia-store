import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { getStoreAdminChatHref } from "@shared/store-admin-sections";
import type { StoreFulfillmentMode } from "@shared/store-fulfillment";
import type { StoreBranch, StoreDeliveryFares, StoreLocation } from "@shared/store-schema";

export type MyStoreSummary = {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
  rubro?: string | null;
  rubroLabel?: string | null;
  coverImageUrl?: string | null;
  location?: StoreLocation | null;
  branches?: StoreBranch[];
  fulfillmentOptions?: StoreFulfillmentMode[];
  deliveryFares?: StoreDeliveryFares;
  currencyExtras?: import("@shared/store-currency-schema").StoreCurrencyExtra[];
  currencyVisualId?: string;
  currencyAcceptedPaymentIds?: string[];
  whatsappPhone?: string | null;
  whatsappDisplay?: string | null;
  whatsappUrl?: string | null;
  casheaEnabled?: boolean;
  visibilityActive: boolean;
  hasPendingSubscriptionPayment?: boolean;
};

export const MY_STORE_QUERY_KEY = ["/api/stores/mine"] as const;
export const MY_STAFF_STORE_QUERY_KEY = ["/api/stores/my-staff-store"] as const;

/** Ruta de administración de la tienda (siempre activa). */
export function getMyStoreNavHref(
  store: Pick<MyStoreSummary, "slug" | "visibilityActive"> | null | undefined,
): string | null {
  if (!store?.slug) return null;
  return `/tienda/${encodeURIComponent(store.slug)}/admin`;
}

export function getMyStoreChatNavHref(
  store: Pick<MyStoreSummary, "slug"> | null | undefined,
): string | null {
  if (!store?.slug) return null;
  return getStoreAdminChatHref(store.slug);
}

export function useMyStore(enabled = true) {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: MY_STORE_QUERY_KEY,
    queryFn: async (): Promise<MyStoreSummary | null> => {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/stores/mine", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.status === 404) return null;
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudo cargar tu tienda");
      }
      const data = (await res.json()) as { store: MyStoreSummary };
      return data.store;
    },
    enabled: enabled && isAuthenticated,
  });
}

export type MyStaffStoreSummary = {
  store: Pick<MyStoreSummary, "id" | "name" | "slug">;
  branchId: string;
  isEmployee: true;
};

export function useMyStaffStore(enabled = true) {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: MY_STAFF_STORE_QUERY_KEY,
    queryFn: async (): Promise<MyStaffStoreSummary | null> => {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/stores/my-staff-store", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.status === 404) return null;
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudo cargar tu tienda de trabajo");
      }
      return res.json() as Promise<MyStaffStoreSummary>;
    },
    enabled: enabled && isAuthenticated,
  });
}

export { getStoreAdminChatHref };

export function useStoreSubscriptionQuote() {
  return useQuery({
    queryKey: ["/api/stores/subscription-quote"],
    queryFn: async () => {
      const res = await fetch("/api/stores/subscription-quote");
      if (!res.ok) throw new Error("No se pudo cargar el precio de la tienda");
      return res.json() as Promise<{ monthlyUsd: number; label: string }>;
    },
  });
}

export type StoreBySlugResponse = {
  store: MyStoreSummary;
  isOwner: boolean;
  isEmployee?: boolean;
  employeeBranchId?: string | null;
  canManageStore?: boolean;
  canManageStaff?: boolean;
  canFilterOrdersByBranch?: boolean;
  visibilityActive: boolean;
  /** Tienda existente pero sin suscripción vigente (visitante no dueño). */
  inactive?: boolean;
};

export function useStoreBySlug(slug: string, enabled = true) {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: ["/api/stores", slug],
    queryFn: async (): Promise<StoreBySlugResponse> => {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/stores/${encodeURIComponent(slug)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudo cargar la tienda");
      }
      return res.json() as Promise<StoreBySlugResponse>;
    },
    enabled: enabled && Boolean(slug),
  });
}
