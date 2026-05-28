import { Star, X, Phone, Hash } from "lucide-react";
import type { CentralFleetDriver } from "@/hooks/use-central";
import { formatCentralFleetMapHint } from "@/lib/central-fleet-position";
import { CentralActiveServicePanel } from "@/components/central/CentralActiveServicePanel";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { centralOffsetAboveBottomNav } from "@/lib/central-viewport-layout";
import { cn } from "@/lib/utils";

export function CentralDriverCard({ driver }: { driver: CentralFleetDriver }) {
  const phone = driver.phone?.trim() || null;
  const plate = driver.licensePlate?.trim() || null;
  const mapHint = formatCentralFleetMapHint(driver);
  const connectionLabel = driver.receivingStoppedAt
    ? "Servicio apagado"
    : driver.inService
      ? driver.positionLive
        ? "En movimiento"
        : "En servicio"
      : driver.receiving
        ? "En línea"
        : "Sin señal en vivo";
  const connectionVariant =
    driver.receiving || driver.inService
      ? driver.receivingStoppedAt
        ? "secondary"
        : "outline"
      : "secondary";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Avatar className="h-12 w-12 ring-2 ring-primary/20">
          <AvatarImage src={driver.avatar ?? undefined} />
          <AvatarFallback className="bg-primary/10 text-primary">
            {driver.name[0]}
            {driver.lastName[0]}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">
            {driver.name} {driver.lastName}
          </p>
          <p className="text-sm text-muted-foreground flex items-center gap-1">
            <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
            {driver.rating.toFixed(1)}
          </p>
        </div>
      </div>
      <div className="grid gap-2 rounded-lg border border-border/60 bg-muted/15 px-3 py-2.5 text-sm">
        {phone ? (
          <a
            href={`tel:${phone.replace(/\s/g, "")}`}
            className="flex items-center gap-2 font-medium text-primary hover:underline"
          >
            <Phone className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
            <span className="truncate">{phone}</span>
          </a>
        ) : (
          <p className="flex items-center gap-2 text-muted-foreground">
            <Phone className="h-4 w-4 shrink-0" aria-hidden />
            Teléfono no disponible
          </p>
        )}
        {plate ? (
          <p className="flex items-center gap-2 text-foreground">
            <Hash className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span>
              Placa: <span className="font-mono font-semibold tracking-wide">{plate}</span>
            </span>
          </p>
        ) : (
          <p className="flex items-center gap-2 text-muted-foreground">
            <Hash className="h-4 w-4 shrink-0" aria-hidden />
            Placa no registrada
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge variant={driver.inService ? "default" : "secondary"}>
          {driver.inService ? "En servicio" : "Buscando clientes"}
        </Badge>
        <Badge variant={connectionVariant}>{connectionLabel}</Badge>
      </div>
      {mapHint ? (
        <p className="text-xs text-muted-foreground">{mapHint}</p>
      ) : null}
      {(driver.receivingTaxi || driver.receivingDelivery) ? (
        <div className="flex flex-wrap gap-2">
          {driver.receivingTaxi && driver.receivingDelivery ? (
            <Badge
              variant="secondary"
              className="border-emerald-500/35 bg-emerald-500/10 text-xs font-normal text-emerald-900 dark:text-emerald-100"
            >
              Modo híbrido · taxi y delivery
            </Badge>
          ) : null}
          {driver.receivingTaxi ? (
            <Badge variant="secondary" className="text-xs font-normal">
              Trabajando · taxi
            </Badge>
          ) : null}
          {driver.receivingDelivery ? (
            <Badge variant="secondary" className="text-xs font-normal">
              Trabajando · delivery
            </Badge>
          ) : null}
        </div>
      ) : null}
      {driver.activeService ? (
        <CentralActiveServicePanel service={driver.activeService} />
      ) : driver.inService ? (
        <p className="text-xs text-muted-foreground">
          En servicio; los detalles del viaje aparecerán en cuanto se sincronicen con el servidor.
        </p>
      ) : null}
    </div>
  );
}

type CentralDriverMapSheetProps = {
  driver: CentralFleetDriver | null;
  onClose: () => void;
};

/** Panel inferior sobre el mapa (estilo Go), encima de la barra de navegación. */
export function CentralDriverMapSheet({ driver, onClose }: CentralDriverMapSheetProps) {
  if (!driver) return null;

  return (
    <div
      className={cn(
        "pointer-events-auto absolute inset-x-0 z-40 mx-3 rounded-2xl border border-border/80 bg-background/95 p-4 shadow-xl backdrop-blur-md",
      )}
      style={{ bottom: centralOffsetAboveBottomNav("0.75rem") }}
      role="dialog"
      aria-label="Conductor seleccionado"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Conductor</p>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onClose} aria-label="Cerrar">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <CentralDriverCard driver={driver} />
    </div>
  );
}
