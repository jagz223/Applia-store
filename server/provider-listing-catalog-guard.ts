import { CATALOG_EDIT_LOCKED_MESSAGE } from "@shared/provider-listing-owner-messages";
import {
  isProviderListingSubscriptionExpired,
  type ProviderListingSubscriptionFields,
} from "@shared/provider-listing-subscription";

/** Bloquea PATCH/DELETE de servicios de catálogo cuando la suscripción de visibilidad venció. */
export function catalogServiceMutationBlockedResponse(
  provider: ProviderListingSubscriptionFields | null | undefined,
  isAdmin: boolean,
): { status: 403; message: string } | null {
  if (isAdmin) return null;
  if (!isProviderListingSubscriptionExpired(provider)) return null;
  return { status: 403, message: CATALOG_EDIT_LOCKED_MESSAGE };
}
