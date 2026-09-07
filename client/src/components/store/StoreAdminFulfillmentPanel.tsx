import { StoreFulfillmentConfigCard } from "@/components/store/StoreFulfillmentConfigCard";
import { StoreDeliveryZoneConfigCard } from "@/components/store/StoreDeliveryZoneConfigCard";
import type { StoreFulfillmentMode } from "@shared/store-fulfillment";
import type { StoreBranch, StoreDeliveryFares, StoreLocation } from "@shared/store-schema";

type StoreAdminFulfillmentPanelProps = {
  storeId: number;
  slug: string;
  initialFulfillmentOptions: StoreFulfillmentMode[];
  initialDeliveryFares?: StoreDeliveryFares | null;
  currencyVisualId?: string | null;
  storeLocation: StoreLocation | null;
  storeBranches?: StoreBranch[] | null;
};

export function StoreAdminFulfillmentPanel({
  storeId,
  slug,
  initialFulfillmentOptions,
  initialDeliveryFares,
  currencyVisualId,
  storeLocation,
  storeBranches,
}: StoreAdminFulfillmentPanelProps) {
  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="space-y-1">
        <h2 className="font-display text-2xl font-bold tracking-tight">Métodos de entrega</h2>
        <p className="text-sm text-muted-foreground">
          Activa delivery, pickup o consumir en el lugar, configura tarifas y el perímetro de
          cobertura.
        </p>
      </div>

      <StoreFulfillmentConfigCard
        storeId={storeId}
        slug={slug}
        initialOptions={initialFulfillmentOptions}
        initialDeliveryFares={initialDeliveryFares}
        currencyVisualId={currencyVisualId}
        storeLocation={storeLocation}
        storeBranches={storeBranches}
      />

      <StoreDeliveryZoneConfigCard
        storeId={storeId}
        slug={slug}
        initialLocation={storeLocation}
        initialBranches={storeBranches}
      />
    </div>
  );
}
