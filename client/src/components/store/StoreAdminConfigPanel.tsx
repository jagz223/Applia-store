import { StoreFulfillmentConfigCard } from "@/components/store/StoreFulfillmentConfigCard";
import { StoreLocationConfigCard } from "@/components/store/StoreLocationConfigCard";
import { StorePaymentMethodsConfigCard } from "@/components/store/StorePaymentMethodsConfigCard";
import type { StoreFulfillmentMode } from "@shared/store-fulfillment";
import type { StoreDeliveryFares, StoreLocation } from "@shared/store-schema";

type StoreAdminConfigPanelProps = {
  storeId: number;
  slug: string;
  initialFulfillmentOptions: StoreFulfillmentMode[];
  initialDeliveryFares?: StoreDeliveryFares | null;
  initialLocation: StoreLocation | null;
};

export function StoreAdminConfigPanel({
  storeId,
  slug,
  initialFulfillmentOptions,
  initialDeliveryFares,
  initialLocation,
}: StoreAdminConfigPanelProps) {
  return (
    <div className="space-y-6">
      <StoreLocationConfigCard slug={slug} initialLocation={initialLocation} />

      <StoreFulfillmentConfigCard
        slug={slug}
        initialOptions={initialFulfillmentOptions}
        initialDeliveryFares={initialDeliveryFares}
        storeLocation={initialLocation}
      />

      <StorePaymentMethodsConfigCard storeId={storeId} />
    </div>
  );
}
