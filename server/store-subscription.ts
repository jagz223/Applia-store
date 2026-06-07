/**
 * Suscripción de visibilidad de tiendas — cotización y extensión tras pago (Prompt 3).
 */
import type { Store } from "@shared/store-schema";
import {
  STORE_SUBSCRIPTION_FEE_SLUG,
  storeSubscriptionQuoteLabel,
  subscriptionMonthlyUsdForStore,
} from "@shared/store-subscription-fee";
import { genFebStorage } from "./storage-genfeb";
import { getSubscriptionFeesByCategorySlug } from "./subscription-fees";

export type StoreSubscriptionQuote = {
  monthlyUsd: number;
  label: string;
  feeSlug: typeof STORE_SUBSCRIPTION_FEE_SLUG;
};

export async function getStoreSubscriptionQuote(): Promise<StoreSubscriptionQuote> {
  const fees = await getSubscriptionFeesByCategorySlug();
  const monthlyUsd = subscriptionMonthlyUsdForStore(fees);
  return {
    monthlyUsd,
    label: storeSubscriptionQuoteLabel(monthlyUsd),
    feeSlug: STORE_SUBSCRIPTION_FEE_SLUG,
  };
}

/**
 * Hook para Prompt 3: al aprobar comprobante de mensualidad de tienda, extiende vigencia.
 */
export async function applyStoreSubscriptionPaymentApproval(args: {
  storeId: number;
  months: number;
  approvedAt?: Date;
}): Promise<Store> {
  return genFebStorage.extendStoreVisibilitySubscription({
    storeId: args.storeId,
    months: args.months,
    approvalAt: args.approvedAt ?? new Date(),
  });
}
