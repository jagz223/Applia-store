import { listingSubscriptionDaysRemaining } from "./professional-listing-subscription";

export type ProviderListingSubscriptionFields = {
  isVerified?: boolean | null;
  isListingPublished?: boolean | null;
  visibilitySubscriptionEndsAt?: string | null;
  subscriptionDaysRemaining?: number | null;
};

/** Suscripción de visibilidad vencida: fuera del catálogo público (reservas ya agendadas siguen su curso). */
export function isProviderListingSubscriptionExpired(
  provider: ProviderListingSubscriptionFields | null | undefined,
): boolean {
  if (!provider?.isVerified) return false;
  const endsAt = provider.visibilitySubscriptionEndsAt;
  if (endsAt == null || endsAt === "") return false;

  const days =
    provider.subscriptionDaysRemaining ??
    listingSubscriptionDaysRemaining(endsAt) ??
    null;
  if (provider.isListingPublished === false) return true;
  return typeof days === "number" && days <= 0;
}
