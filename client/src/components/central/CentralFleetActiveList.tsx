import { Car, ChevronRight, Radio } from "lucide-react";
import type { CentralFleetDriver } from "@/hooks/use-central";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function driverStatusLabel(driver: CentralFleetDriver): string {
  if (driver.inService) return driver.positionLive ? "En movimiento" : "En servicio";
  if (driver.receivingTaxi && driver.receivingDelivery) return "Híbrido · taxi y delivery";
  if (driver.receivingTaxi) return "Trabajando · taxi";
  if (driver.receivingDelivery) return "Trabajando · delivery";
  if (driver.receiving) return "En línea";
  return "Activo";
}

type CentralFleetActiveListProps = {
  drivers: CentralFleetDriver[];
  selectedUserId: string | null;
  onSelectDriver: (driver: CentralFleetDriver) => void;
  /** Altura máxima del scroll interno. */
  maxHeightClass?: string;
  emptyMessage?: string;
};

export function CentralFleetActiveList({
  drivers,
  selectedUserId,
  onSelectDriver,
  maxHeightClass = "max-h-72",
  emptyMessage = "No hay conductores recibiendo servicios ni en viaje en este momento.",
}: CentralFleetActiveListProps) {
  if (drivers.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border/80 bg-muted/15 px-4 py-6 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </p>
    );
  }

  return (
    <ul className={cn("space-y-1.5 overflow-y-auto pr-0.5", maxHeightClass)} aria-label="Conductores activos">
      {drivers.map((driver) => {
        const selected = selectedUserId === driver.userId;
        const plate = driver.licensePlate?.trim();
        return (
          <li key={driver.userId}>
            <button
              type="button"
              onClick={() => onSelectDriver(driver)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                selected
                  ? "border-primary/50 bg-primary/10 ring-1 ring-primary/25"
                  : "border-border/70 bg-card/80 hover:border-primary/30 hover:bg-muted/30",
              )}
            >
              <Avatar className="h-10 w-10 shrink-0 ring-1 ring-border/60">
                <AvatarImage src={driver.avatar ?? undefined} />
                <AvatarFallback className="bg-primary/10 text-xs text-primary">
                  {driver.name[0]}
                  {driver.lastName[0]}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {driver.name} {driver.lastName}
                </p>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  <Badge
                    variant={driver.inService ? "default" : "secondary"}
                    className="h-5 px-1.5 text-[10px] font-normal"
                  >
                    {driverStatusLabel(driver)}
                  </Badge>
                  {plate ? (
                    <span className="truncate font-mono text-[10px] text-muted-foreground">{plate}</span>
                  ) : null}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Encabezado compacto para el listado de flota activa. */
export function CentralFleetActiveListHeader({ count }: { count: number }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
          <Radio className="h-4 w-4 text-primary" aria-hidden />
        </div>
        <div>
          <p className="text-sm font-semibold leading-tight">Conductores activos</p>
          <p className="text-[11px] text-muted-foreground">Recibiendo servicios o en viaje</p>
        </div>
      </div>
      <Badge variant="outline" className="tabular-nums">
        <Car className="mr-1 h-3 w-3" aria-hidden />
        {count}
      </Badge>
    </div>
  );
}
