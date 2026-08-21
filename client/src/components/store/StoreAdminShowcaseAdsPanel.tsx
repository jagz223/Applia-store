import { StoreShowcaseAdsConfigCard } from "@/components/store/StoreShowcaseAdsConfigCard";

export function StoreAdminShowcaseAdsPanel({ storeId }: { storeId: number }) {
  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="space-y-1">
        <h2 className="font-display text-2xl font-bold tracking-tight">Banners y Pop ups</h2>
        <p className="text-sm text-muted-foreground">
          Configura los carruseles visibles en la vitrina y los pop ups que se muestran al volver luego de 1 hora.
        </p>
      </div>

      <StoreShowcaseAdsConfigCard storeId={storeId} />
    </div>
  );
}

