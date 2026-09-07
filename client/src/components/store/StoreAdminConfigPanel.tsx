import { StoreLocationConfigCard } from "@/components/store/StoreLocationConfigCard";
import { StoreWhatsAppConfigCard } from "@/components/store/StoreWhatsAppConfigCard";
import type { StoreBranch, StoreLocation } from "@shared/store-schema";

type StoreAdminConfigPanelProps = {
  storeId: number;
  slug: string;
  initialLocation: StoreLocation | null;
  initialBranches?: StoreBranch[] | null;
  initialWhatsappPhone?: string | null;
};

export function StoreAdminConfigPanel({
  storeId,
  slug,
  initialLocation,
  initialBranches,
  initialWhatsappPhone,
}: StoreAdminConfigPanelProps) {
  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="space-y-1">
        <h2 className="font-display text-2xl font-bold tracking-tight">Configuración</h2>
        <p className="text-sm text-muted-foreground">
          Ubicación y WhatsApp de atención de tu tienda.
        </p>
      </div>

      <StoreLocationConfigCard
        storeId={storeId}
        slug={slug}
        initialLocation={initialLocation}
        initialBranches={initialBranches}
      />

      <StoreWhatsAppConfigCard storeId={storeId} initialPhone={initialWhatsappPhone} />
    </div>
  );
}
