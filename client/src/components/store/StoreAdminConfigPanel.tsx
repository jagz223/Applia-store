import { StoreFulfillmentConfigCard } from "@/components/store/StoreFulfillmentConfigCard";
import { StoreLocationConfigCard } from "@/components/store/StoreLocationConfigCard";
import { StoreWhatsAppConfigCard } from "@/components/store/StoreWhatsAppConfigCard";
import type { StoreFulfillmentMode } from "@shared/store-fulfillment";
import type { StoreBranch, StoreDeliveryFares, StoreLocation } from "@shared/store-schema";

type StoreAdminConfigPanelProps = {
  storeId: number;
  slug: string;
  initialFulfillmentOptions: StoreFulfillmentMode[];
  initialDeliveryFares?: StoreDeliveryFares | null;
  initialLocation: StoreLocation | null;
  initialBranches?: StoreBranch[] | null;
  initialWhatsappPhone?: string | null;
};

export function StoreAdminConfigPanel({
  storeId,
  slug,
  initialFulfillmentOptions,
  initialDeliveryFares,
  initialLocation,
  initialBranches,
  initialWhatsappPhone,
}: StoreAdminConfigPanelProps) {
  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="space-y-1">
        <h2 className="font-display text-2xl font-bold tracking-tight">Configuración</h2>
        <p className="text-sm text-muted-foreground">
          Ubicación, modalidades de entrega y WhatsApp de atención de tu tienda.
        </p>
      </div>

      <StoreLocationConfigCard
        storeId={storeId}
        slug={slug}
        initialLocation={initialLocation}
        initialBranches={initialBranches}
      />

      <StoreFulfillmentConfigCard
        storeId={storeId}
        slug={slug}
        initialOptions={initialFulfillmentOptions}
        initialDeliveryFares={initialDeliveryFares}
        storeLocation={initialLocation}
        storeBranches={initialBranches}
      />

      <StoreWhatsAppConfigCard storeId={storeId} initialPhone={initialWhatsappPhone} />
    </div>
  );
}
