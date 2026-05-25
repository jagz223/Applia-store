import { useQuery } from "@tanstack/react-query";
import type { PublicPromoExpiryBanner, PublicPromoUrgency } from "@shared/public-promotional-notifications";

export type PublicPromotionalCodeCard = {
  id: number;
  code: string;
  benefitDescription: string;
  singleUsePerAccount: boolean;
  expirationType: string;
  expiryBanner: PublicPromoExpiryBanner;
  isExpired?: boolean;
};

export const PUBLIC_PROMOTIONAL_CODES_QUERY_KEY = ["/api/promotional-codes/public"] as const;

const getToken = () => {
  try {
    return localStorage.getItem("token");
  } catch {
    return null;
  }
};

export function usePublicPromotionalCodes(enabled = true, highlightPromoId?: number) {
  return useQuery({
    queryKey: [...PUBLIC_PROMOTIONAL_CODES_QUERY_KEY, highlightPromoId ?? null] as const,
    enabled,
    refetchInterval: 30_000,
    queryFn: async (): Promise<PublicPromotionalCodeCard[]> => {
      const token = getToken();
      const qs =
        highlightPromoId != null && Number.isFinite(highlightPromoId) && highlightPromoId > 0
          ? `?promo=${encodeURIComponent(String(highlightPromoId))}`
          : "";
      const res = await fetch(`/api/promotional-codes/public${qs}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { message?: string }).message ?? "Error al cargar promociones");
      }
      return res.json();
    },
  });
}

export const publicPromoUrgencyStyles: Record<
  PublicPromoUrgency,
  { banner: string; badge: string; ring: string }
> = {
  calm: {
    banner: "bg-primary/10 text-primary border-primary/25",
    badge: "bg-primary/15 text-primary",
    ring: "ring-primary/20",
  },
  soon: {
    banner: "bg-amber-500/15 text-amber-800 dark:text-amber-200 border-amber-500/30",
    badge: "bg-amber-500/20 text-amber-900 dark:text-amber-100",
    ring: "ring-amber-500/25",
  },
  urgent: {
    banner: "bg-orange-500/15 text-orange-900 dark:text-orange-100 border-orange-500/35",
    badge: "bg-orange-500/25 text-orange-950 dark:text-orange-50",
    ring: "ring-orange-500/30",
  },
  critical: {
    banner: "bg-destructive/15 text-destructive border-destructive/40 animate-pulse",
    badge: "bg-destructive text-destructive-foreground",
    ring: "ring-destructive/40",
  },
};
