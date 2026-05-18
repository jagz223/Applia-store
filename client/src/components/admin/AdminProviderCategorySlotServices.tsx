import { Badge } from "@/components/ui/badge";
import {
  isMultiServiceCatalogBrandSlug,
  providerServicesForCategorySlot,
  type AdminProviderCategoryOption,
  type AdminProviderDetailService,
} from "@/components/admin/admin-provider-detail-lib";

type Props = {
  services: readonly AdminProviderDetailService[];
  categoryId: number | null | undefined;
  categories: readonly AdminProviderCategoryOption[];
  brandDisplayName?: string | null;
};

export function AdminProviderCategorySlotServices({
  services,
  categoryId,
  categories,
  brandDisplayName,
}: Props) {
  const category = categories.find((c) => c.id === Number(categoryId));
  const slug = category?.slug ?? null;
  if (!isMultiServiceCatalogBrandSlug(slug)) return null;

  const brandServices = providerServicesForCategorySlot(services, categoryId, categories);
  if (brandServices.length === 0) return null;

  const label = brandDisplayName ?? category?.displayName ?? "esta marca";

  return (
    <div className="space-y-1.5 pt-1 border-t border-border/50">
      <p className="text-[11px] text-muted-foreground leading-snug">
        Fichas en {label}
        {brandServices.length > 1 ? ` (${brandServices.length})` : ""}:
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {brandServices.map((svc) => {
          const chip = svc.subcategoryName?.trim() || svc.title?.trim() || `Servicio #${svc.id}`;
          return (
            <li key={svc.id}>
              <Badge
                variant={svc.isActive ? "secondary" : "outline"}
                className="text-[11px] font-normal max-w-[14rem] truncate"
                title={svc.title ? `${chip} · ${svc.title}` : chip}
              >
                {chip}
                {!svc.isActive ? " (inactivo)" : null}
              </Badge>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
