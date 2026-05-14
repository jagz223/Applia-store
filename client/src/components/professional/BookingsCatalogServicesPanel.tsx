import { useMemo } from "react";
import type { ServiceWithProvider } from "@shared/schema";
import { getCategoryDisplayName } from "@shared/default-categories";
import { isSelfServiceCatalogActiveToggleDisallowedForCategorySlug } from "@shared/catalog-service-visibility-policy";
import { useMyServices, usePatchService } from "@/hooks/use-mango-data";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

function categorySlugOf(service: ServiceWithProvider): string {
  return String((service.category as { slug?: string } | undefined)?.slug ?? "").trim().toLowerCase();
}

function isMobilityCatalogService(service: ServiceWithProvider): boolean {
  return isSelfServiceCatalogActiveToggleDisallowedForCategorySlug(categorySlugOf(service));
}

function sortServicesForBookingsTab(a: ServiceWithProvider, b: ServiceWithProvider): number {
  const ma = isMobilityCatalogService(a) ? 1 : 0;
  const mb = isMobilityCatalogService(b) ? 1 : 0;
  if (ma !== mb) return ma - mb;
  return (a.title || "").localeCompare(b.title || "", "es");
}

type RowProps = {
  service: ServiceWithProvider;
  patch: ReturnType<typeof usePatchService>;
};

function ServiceVisibilityRow({ service, patch }: RowProps) {
  const slug = categorySlugOf(service);
  const locked = isSelfServiceCatalogActiveToggleDisallowedForCategorySlug(slug);
  const label = getCategoryDisplayName(service.category) || "Servicio";
  const active = service.isActive !== false;
  const pendingThis = patch.isPending && patch.variables?.serviceId === service.id;

  if (locked) {
    return (
      <div
        className="flex flex-col gap-1 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
        data-testid={`bookings-service-visibility-locked-${service.id}`}
      >
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-medium text-foreground line-clamp-1">{service.title}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xs text-muted-foreground">
            Taxi, envíos y marketplace no se pausan aquí (usá la vista de conductor). Estado en catálogo:{" "}
            <span className="font-medium text-foreground">{active ? "visible" : "oculto"}</span>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/60 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-0.5 pr-2">
        <p className="text-sm font-medium text-foreground line-clamp-1">{service.title}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        {pendingThis ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden /> : null}
        <div className="flex items-center gap-2">
          <Switch
            id={`bookings-svc-active-${service.id}`}
            checked={active}
            disabled={patch.isPending}
            onCheckedChange={(checked) => {
              patch.mutate({ serviceId: service.id, data: { isActive: checked } });
            }}
            aria-label={active ? "Pausar servicio en el catálogo" : "Mostrar servicio en el catálogo"}
          />
          <Label htmlFor={`bookings-svc-active-${service.id}`} className="text-xs text-muted-foreground cursor-pointer">
            {active ? "Visible" : "Pausado"}
          </Label>
        </div>
      </div>
    </div>
  );
}

/**
 * Pestaña Reservas: pausar/reactivar fichas de catálogo por servicio.
 * Taxi / delivery / marketplace: solo lectura (vista conductor).
 */
export function BookingsCatalogServicesPanel({ className }: { className?: string }) {
  const { data: services = [], isLoading } = useMyServices();
  const patch = usePatchService();
  const sorted = useMemo(() => [...services].sort(sortServicesForBookingsTab), [services]);

  if (isLoading) {
    return (
      <div className={cn("flex items-center gap-2 text-xs text-muted-foreground", className)}>
        <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" aria-hidden />
        Cargando tus servicios…
      </div>
    );
  }

  if (sorted.length === 0) {
    return null;
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div>
        <p className="text-sm font-medium text-foreground">Fichas en el catálogo</p>
        <p className="text-xs text-muted-foreground">
          Desde <strong className="text-foreground">Reservas</strong> podés pausar o reactivar servicios que no son taxi,
          envíos ni marketplace. Lo de Go se gestiona en la app de conductor.
        </p>
      </div>
      <div className="space-y-2">
        {sorted.map((s) => (
          <ServiceVisibilityRow key={s.id} service={s} patch={patch} />
        ))}
      </div>
    </div>
  );
}
