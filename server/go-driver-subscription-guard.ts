import { catalogService } from "./services";
import { isFullAdmin } from "@shared/roles";
import {
  GO_DRIVER_SUBSCRIPTION_INACTIVE_MESSAGE,
  isGoDriverSubscriptionActive,
} from "@shared/go-driver-subscription";

export { GO_DRIVER_SUBSCRIPTION_INACTIVE_MESSAGE };

export async function driverGoSubscriptionAllowsOperation(
  driverUserId: string,
  userRole?: string | null,
): Promise<boolean> {
  if (isFullAdmin(userRole)) return true;
  const provider = await catalogService.getProviderByUserId(driverUserId);
  if (!provider) return false;
  return isGoDriverSubscriptionActive(
    (provider as { visibilitySubscriptionEndsAt?: unknown }).visibilitySubscriptionEndsAt,
  );
}
