import { StoreFulfillmentConfigCard } from "@/components/store/StoreFulfillmentConfigCard";
import { StoreLocationConfigCard } from "@/components/store/StoreLocationConfigCard";
import { StorePaymentMethodsConfigCard } from "@/components/store/StorePaymentMethodsConfigCard";
import { StoreWhatsAppConfigCard } from "@/components/store/StoreWhatsAppConfigCard";
import { StoreCasheaConfigCard } from "@/components/store/StoreCasheaConfigCard";
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
  initialCasheaEnabled?: boolean;
};

export function StoreAdminConfigPanel({
  storeId,
  slug,
  initialFulfillmentOptions,
  initialDeliveryFares,
  initialLocation,
  initialBranches,
  initialWhatsappPhone,
  initialCasheaEnabled,
}: StoreAdminConfigPanelProps) {
  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="space-y-1">
        <h2 className="font-display text-2xl font-bold tracking-tight">Configuración</h2>
        <p className="text-sm text-muted-foreground">
          Ubicación, modalidades de entrega y métodos de pago de tu tienda.
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

      <StorePaymentMethodsConfigCard storeId={storeId} />

      <StoreWhatsAppConfigCard storeId={storeId} initialPhone={initialWhatsappPhone} />

      <StoreCasheaConfigCard storeId={storeId} initialEnabled={initialCasheaEnabled} />
    </div>
  );
}
