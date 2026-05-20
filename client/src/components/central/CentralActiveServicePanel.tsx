import { useState } from "react";
import type { GeoJsonObject } from "geojson";
import { Clock, DollarSign, MapPin, Navigation, Package, Route } from "lucide-react";
import type { CentralActiveService } from "@shared/central-fleet";
import { TaxiRouteMap } from "@/components/taxi/TaxiRouteMap";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function paymentLabel(method: string) {
  if (method === "cash") return "Efectivo";
  if (method === "bank_transfer") return "Transferencia bancaria";
  return method;
}

function statusLabel(status: CentralActiveService["status"]) {
  if (status === "matched") return "Asignado — en camino al punto de recogida";
  if (status === "in_progress") return "En curso — viaje iniciado";
  return status;
}

function vehicleKindLabel(kind: string) {
  const k = kind.toLowerCase();
  if (k === "moto") return "Moto";
  if (k === "auto") return "Auto";
  if (k === "pet_car") return "Auto pet friendly";
  if (k === "camioneta") return "Camioneta";
  return kind;
}

function riderInitial(name: string) {
  const t = name.trim();
  if (!t) return "?";
  return t.slice(0, 2).toUpperCase();
}

export function CentralActiveServicePanel({ service }: { service: CentralActiveService }) {
  const [routeOpen, setRouteOpen] = useState(false);
  const km = (service.distanceM / 1000).toFixed(1);
  const min = Math.max(1, Math.round(service.durationSec / 60));
  const riderPhone = service.rider.phone?.trim() || null;
  const riderName = `${service.rider.name}${service.rider.lastName ? ` ${service.rider.lastName}` : ""}`.trim();
  const modeLabel = service.mode === "taxi" ? "Taxi (movilidad)" : "Delivery";
  const ModeIcon = service.mode === "taxi" ? Route : Package;
  const riderImg = service.rider.profileImageUrl?.trim() || null;
  const ratingCount =
    typeof service.rider.ratingCount === "number" && Number.isFinite(service.rider.ratingCount)
      ? Math.max(0, Math.round(service.rider.ratingCount))
      : 0;
  const rating =
    typeof service.rider.rating === "number" && Number.isFinite(service.rider.rating) ? service.rider.rating : 0;

  return (
    <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="default" className="gap-1">
          <ModeIcon className="h-3 w-3" aria-hidden />
          {modeLabel}
        </Badge>
        <Badge variant="outline">{statusLabel(service.status)}</Badge>
        {service.driverSearchingClient ? (
          <Badge variant="secondary" className="font-normal">
            Buscando al cliente
          </Badge>
        ) : null}
      </div>

      <p className="text-[11px] font-mono text-muted-foreground">ID servicio: {service.rideId}</p>

      <div className="grid gap-2 border-t border-border/50 pt-2">
        <div className="flex items-start gap-2">
          <Avatar className="mt-0.5 h-9 w-9 shrink-0 border border-border/70">
            {riderImg ? <AvatarImage src={riderImg} alt="" className="object-cover" /> : null}
            <AvatarFallback className="text-[10px] font-semibold">{riderInitial(riderName || "Cliente")}</AvatarFallback>
          </Avatar>
          <p className="min-w-0 flex-1 leading-snug">
            <span className="font-medium text-foreground">Cliente</span>
            <br />
            <span className="text-foreground/95">{riderName || "Cliente"}</span>
            {ratingCount > 0 ? (
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Valoración {rating.toFixed(1)} · {ratingCount} reseña{ratingCount === 1 ? "" : "s"}
              </span>
            ) : (
              <span className="mt-0.5 block text-xs text-muted-foreground">Sin reseñas aún</span>
            )}
            {riderPhone ? (
              <>
                <br />
                <a href={`tel:${riderPhone.replace(/\s/g, "")}`} className="text-primary hover:underline">
                  {riderPhone}
                </a>
              </>
            ) : (
              <span className="text-muted-foreground"> · teléfono no disponible</span>
            )}
          </p>
        </div>

        <p className="flex items-start gap-2">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
          <span>
            <span className="font-medium text-foreground">Recogida</span>
            <br />
            <span className="text-muted-foreground">{service.start.label || "Sin etiqueta"}</span>
          </span>
        </p>

        <p className="flex items-start gap-2">
          <Navigation className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden />
          <span>
            <span className="font-medium text-foreground">Entrega / destino</span>
            <br />
            <span className="text-muted-foreground">{service.end.label || "Sin etiqueta"}</span>
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

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9 w-full shrink-0 gap-1.5 font-medium"
        onClick={() => setRouteOpen(true)}
      >
        <MapPin className="h-4 w-4 shrink-0" aria-hidden />
        Mapa
      </Button>

      <Dialog open={routeOpen} onOpenChange={setRouteOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Ruta · {modeLabel}
            </DialogTitle>
            <DialogDescription asChild>
              <div className="max-h-[30vh] space-y-1.5 overflow-y-auto text-left text-xs leading-snug text-muted-foreground">
                <p>
                  <span className="font-medium text-foreground">A:</span> {service.start.label}
                </p>
                <p>
                  <span className="font-medium text-foreground">B:</span> {service.end.label}
                </p>
                <p className="font-mono text-[10px] text-muted-foreground/90">ID: {service.rideId}</p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 h-[min(50vh,420px)] overflow-hidden rounded-xl border border-border">
            <TaxiRouteMap
              fullscreen
              syncDefaultView={false}
              defaultCenter={[service.start.lat, service.start.lon]}
              defaultZoom={13}
              start={service.start}
              end={service.end}
              routeGeometry={(service.routeGeometry ?? null) as GeoJsonObject | null}
              onMapPick={() => {}}
              suppressMapPick
              wrapperClassName="!rounded-none !border-0 !shadow-none h-full w-full"
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
