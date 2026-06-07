import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";

export type MyStoreSummary = {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
  rubro?: string | null;
  rubroLabel?: string | null;
  coverImageUrl?: string | null;
  visibilityActive: boolean;
  hasPendingSubscriptionPayment?: boolean;
};

export const MY_STORE_QUERY_KEY = ["/api/stores/mine"] as const;

/** Misma ruta que «Mi tienda» en el menú de cuenta: panel si está activa, vitrina si no. */
export function getMyStoreNavHref(
  store: Pick<MyStoreSummary, "slug" | "visibilityActive"> | null | undefined,
): string | null {
  if (!store?.slug) return null;
  const slugEnc = encodeURIComponent(store.slug);
  return store.visibilityActive ? `/tienda/${slugEnc}/admin` : `/tienda/${slugEnc}`;
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
