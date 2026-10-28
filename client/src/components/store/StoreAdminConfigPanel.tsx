import { StoreCoverConfigCard } from "@/components/store/StoreCoverConfigCard";
import { StoreLocationConfigCard } from "@/components/store/StoreLocationConfigCard";
import { StoreWhatsAppConfigCard } from "@/components/store/StoreWhatsAppConfigCard";
import type { StoreImageTransform } from "@shared/store-image-asset";
import type { StoreBranch, StoreLocation } from "@shared/store-schema";

type StoreAdminConfigPanelProps = {
  storeId: number;
  slug: string;
  initialLocation: StoreLocation | null;
  initialBranches?: StoreBranch[] | null;
  initialWhatsappPhone?: string | null;
  initialCoverImageUrl?: string | null;
  initialCoverImageOriginalUrl?: string | null;
  initialCoverImageTransform?: StoreImageTransform | null;
};

export function StoreAdminConfigPanel({
  storeId,
  slug,
  initialLocation,
  initialBranches,
  initialWhatsappPhone,
  initialCoverImageUrl,
  initialCoverImageOriginalUrl,
  initialCoverImageTransform,
}: StoreAdminConfigPanelProps) {
  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="space-y-1">
        <h2 className="font-display text-2xl font-bold tracking-tight">Configuración</h2>
        <p className="text-sm text-muted-foreground">
          Portada, ubicación y WhatsApp de atención de tu tienda.
        </p>
      </div>

      <StoreCoverConfigCard
        storeId={storeId}
        slug={slug}
        initialCoverImageUrl={initialCoverImageUrl}
        initialCoverImageOriginalUrl={initialCoverImageOriginalUrl}
        initialCoverImageTransform={initialCoverImageTransform}
      />

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
