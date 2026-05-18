import { useMemo } from "react";
import {
  useCategories,
  useCurrentProvider,
  useMyServices,
  usePlatformSubscriptionFees,
} from "@/hooks/use-mango-data";
import { subscriptionMonthlyUsdForProvider } from "@shared/provider-subscription-fee";
import { DEFAULT_SUBSCRIPTION_FEE_USD, formatSubscriptionUsdLabel } from "@shared/subscription-category-fees";

/** Mensualidad USD del asociado actual (máximo entre sus líneas Man Go / Pro Go / Car Go, etc.). */
export function useProviderSubscriptionMonthlyUsd(options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;
  const { data: provider } = useCurrentProvider();
  const { data: categories = [] } = useCategories();
  const { data: subscriptionFees } = usePlatformSubscriptionFees({ enabled: enabled && Boolean(provider) });
  const { data: myServices = [] } = useMyServices({ enabled: enabled && Boolean(provider) });

  const serviceCategoryIds = useMemo(
    () =>
      [
        ...new Set(
          (myServices as { categoryId?: number }[])
            .map((s) => Number(s.categoryId))
            .filter((id) => Number.isFinite(id) && id > 0),
        ),
      ],
    [myServices],
  );

  const monthlyUsd = useMemo(() => {
    if (!enabled || !provider) return DEFAULT_SUBSCRIPTION_FEE_USD;
    const map = (subscriptionFees as { feesBySlug?: Record<string, number> } | undefined)?.feesBySlug;
    return subscriptionMonthlyUsdForProvider(provider, map, categories, serviceCategoryIds);
  }, [enabled, provider, subscriptionFees, categories, serviceCategoryIds]);

  const monthlyUsdLabel = useMemo(() => formatSubscriptionUsdLabel(monthlyUsd), [monthlyUsd]);

  return { monthlyUsd, monthlyUsdLabel, provider, categories };
}
