import { Clock, DollarSign, MapPin, Navigation, Package, Route } from "lucide-react";
import type { CentralActiveService } from "@shared/central-fleet";
import { centralActiveServiceModeLabel } from "@/lib/central-fleet-work-accent";
import { Badge } from "@/components/ui/badge";

function paymentLabel(method: string) {
  if (method === "cash") return "Efectivo";
  if (method === "bank_transfer") return "Transferencia bancaria";
  return method;
}

function vehicleKindLabel(kind: string) {
  const k = kind.toLowerCase();
  if (k === "moto") return "Moto";
  if (k === "auto") return "Auto";
  if (k === "pet_car") return "Auto pet friendly";
  if (k === "camioneta") return "Camioneta";
  return kind;
}

export function CentralActiveServicePanel({ service }: { service: CentralActiveService }) {
  const km = (service.distanceM / 1000).toFixed(1);
  const min = Math.max(1, Math.round(service.durationSec / 60));
  const ModeIcon = service.mode === "taxi" ? Route : Package;

  return (
    <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="default" className="gap-1">
          <ModeIcon className="h-3 w-3" aria-hidden />
          {centralActiveServiceModeLabel(service.mode)}
        </Badge>
      </div>

      <p className="text-[11px] font-mono text-muted-foreground">ID servicio: {service.rideId}</p>

      <div className="grid gap-2 border-t border-border/50 pt-2">
        <p className="text-xs text-muted-foreground">Servicio activo de punto A a punto B.</p>

        <p className="flex items-start gap-2">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
          <span>
            <span className="font-medium text-foreground">Punto A (recogida)</span>
            <br />
            <span className="text-muted-foreground">{service.start.label}</span>
          </span>
        </p>

        <p className="flex items-start gap-2">
          <Navigation className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden />
          <span>
            <span className="font-medium text-foreground">Punto B (destino)</span>
            <br />
            <span className="text-muted-foreground">{service.end.label}</span>
          </span>
        </p>
      </div>

      <div className="grid gap-1.5 border-t border-border/50 pt-2 text-xs text-muted-foreground">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1">
            <DollarSign className="h-3.5 w-3.5" aria-hidden />
            <span className="text-foreground font-medium tabular-nums">${service.estimatedUsd.toFixed(2)} USD</span>
            {service.isNegotiated ? " (negociado)" : null}
          </span>
          {service.suggestedUsd != null ? (
            <span className="tabular-nums">Ref. sugerida: ${service.suggestedUsd.toFixed(2)} USD</span>
          ) : null}
        </p>
        <p>
          Pago: <span className="text-foreground">{paymentLabel(service.paymentMethod)}</span>
          {" · "}
          {service.paymentConfirmed ? "Pago confirmado" : "Pago pendiente de confirmar"}
        </p>
        <p className="inline-flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" aria-hidden />
          ~{min} min · {km} km · vehículo {vehicleKindLabel(service.vehicleType)}
        </p>
        {service.mode === "taxi" && service.petEnabled ? (
          <p className="text-foreground">Servicio con opción de mascotas (Pet Car / pet friendly).</p>
        ) : null}
      </div>
    </div>
  );
}
