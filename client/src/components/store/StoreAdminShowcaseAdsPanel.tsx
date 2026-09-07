import { StoreShowcaseAdsConfigCard } from "@/components/store/StoreShowcaseAdsConfigCard";

export function StoreAdminShowcaseAdsPanel({ storeId }: { storeId: number }) {
  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="space-y-1">
        <h2 className="font-display text-2xl font-bold tracking-tight">Banners y Pop ups</h2>
        <p className="text-sm text-muted-foreground">
          Gestiona por pestañas el carrusel de banners y los pop ups de la vitrina: agrega, edita,
          elimina o previsualiza cada imagen.
        </p>
      </div>

      <StoreShowcaseAdsConfigCard storeId={storeId} />
    </div>
  );
}
