import type { GeoJsonObject } from "geojson";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Ban, CheckCircle2, Loader2, Tags, X } from "lucide-react";
import { GoUserRideStatsBadges } from "@/components/go/GoUserRideStatsBadges";
import { Button } from "@/components/ui/button";
import { TaxiRouteMap } from "@/components/taxi/TaxiRouteMap";
import { mobilityServiceLabel } from "@shared/mobility-ui-labels";

export const GO_RIDE_NO_DESTINATION_DRIVER_HINT =
  "Viaje sin ubicación destino, escribe o llama al cliente para establecer el destino y el monto a cancelar";

export type CargoRideOfferPayload = {
  rideId: string;
  rider: {
    name: string;
    lastName?: string;
    profileImageUrl: string | null;
    phone?: string;
    rating?: number | null;
    ratingCount?: number;
    completedTrips?: number;
  };
  start: { lat: number; lon: number; label: string };
  end?: { lat: number; lon: number; label: string } | null;
  destinationPending?: boolean;
  routeGeometry: GeoJsonObject | null;
  distanceM: number;
  durationSec: number;
  vehicleType: string;
  paymentMethod: string;
  estimatedUsd: number;
  suggestedUsd?: number;
  petEnabled?: boolean;
  expiresAt?: number;
  isNegotiated?: boolean;
};

type Props = {
  open: boolean;
  offer: CargoRideOfferPayload | null;
  module?: "cargo" | "pack";
  busy?: boolean;
  driverPos?: { lat: number; lon: number } | null;
  onAccept: () => void;
  onDecline: () => void;
  /** Tiempo agotado sin aceptar/rechazar: solo cerrar UI (el servidor ya reasignó). */
  onExpired?: () => void;
  /** Regateo: enviar monto (precio del cliente o propuesto). */
  onNegotiationPropose?: (amountUsd: number) => Promise<void>;
  /** Regateo: abrir editor de monto fuera del modal (debe cerrar este modal). */
  onNegotiationChangeAmount?: (initialAmountUsd: number) => void;
  negotiationBusy?: boolean;
};

function formatKm(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m)} m`;
}

function formatDur(sec: number): string {
  const m = Math.round(sec / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

function formatUsd(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return `$${v.toFixed(2)}`;
}

function isStandardOffer(offerUsd: number, suggestedUsd: number): boolean {
  const a = Number.isFinite(offerUsd) ? offerUsd : 0;
  const b = Number.isFinite(suggestedUsd) ? suggestedUsd : 0;
  return Math.abs(a - b) <= 0.01;
}

function twoWords(label: string): string {
  const parts = String(label ?? "")
    .trim()
    .split(/\s+/g)
    .filter(Boolean);
  return parts.slice(0, 2).join(" ") || "Punto";
}

export function CargoIncomingRideDialog({
  open,
  offer,
  module,
  busy,
  driverPos,
  onAccept,
  onDecline,
  onExpired,
  onNegotiationPropose,
  onNegotiationChangeAmount,
  negotiationBusy = false,
}: Props) {
  if (!open || !offer) return null;
  if (typeof document === "undefined") return null;
  const title = mobilityServiceLabel(module === "pack" ? "pack" : "cargo");
  const isNego = !!offer.isNegotiated && !!onNegotiationPropose;
  const noDestination = !!offer.destinationPending || !offer.end;

  const ttlMsRef = useRef<number>(18_000);
  const expiredHandledRef = useRef(false);
  const [remainingMs, setRemainingMs] = useState<number>(() => {
    const exp = typeof offer.expiresAt === "number" ? offer.expiresAt : null;
    return exp ? Math.max(0, exp - Date.now()) : ttlMsRef.current;
  });

  useEffect(() => {
    expiredHandledRef.current = false;
    const exp = typeof offer.expiresAt === "number" ? offer.expiresAt : null;
    const ttl = exp ? Math.max(1000, exp - Date.now()) : 18_000;
    ttlMsRef.current = ttl;
    setRemainingMs(ttl);
    const t = window.setInterval(() => {
      if (!exp) {
        setRemainingMs((prev) => Math.max(0, prev - 120));
        return;
      }
      setRemainingMs(Math.max(0, exp - Date.now()));
    }, 120);
    return () => window.clearInterval(t);
    // al cambiar offer.rideId/expiresAt reiniciar el timer
  }, [offer.rideId, offer.expiresAt]);

  useEffect(() => {
    if (remainingMs > 0 || expiredHandledRef.current) return;
    expiredHandledRef.current = true;
    if (onExpired) onExpired();
    else onDecline();
  }, [remainingMs, onExpired, onDecline]);

  const progress = useMemo(() => {
    const ttl = Math.max(1, ttlMsRef.current);
    return Math.max(0, Math.min(1, remainingMs / ttl));
  }, [remainingMs]);
  const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));

  return createPortal(
    <div
      className="fixed inset-0 z-[2147483000] flex flex-col justify-end bg-black/55 p-2 pt-[max(0.75rem,env(safe-area-inset-top,0px))] pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] backdrop-blur-sm md:justify-center md:p-4"
      role="dialog"
      aria-modal
      aria-labelledby="cargo-offer-title"
    >
      <div className="flex max-h-[min(92dvh,740px)] w-full flex-col overflow-y-auto rounded-2xl border border-border bg-background shadow-2xl md:mx-auto md:max-w-lg">
        <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h2 id="cargo-offer-title" className="font-display text-lg font-bold text-foreground">
              Nueva solicitud · {title}
            </h2>
            <p className="text-sm text-muted-foreground">Solo lo esencial para decidir</p>
            {isNego ? (
              <span className="mt-2 inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-900 dark:text-amber-100">
                <Tags className="h-3 w-3" aria-hidden />
                Regateo
              </span>
            ) : null}
          </div>
          <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={onDecline} aria-label="Cerrar">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          {offer.rider.profileImageUrl ? (
            <img
              src={offer.rider.profileImageUrl}
              alt=""
              className="h-14 w-14 shrink-0 rounded-full object-cover ring-2 ring-primary/30"
            />
          ) : (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-muted text-lg font-semibold text-muted-foreground">
              {offer.rider.name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate font-display text-base font-bold text-foreground">{offer.rider.name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {offer.petEnabled ? " · Pet Car" : ""}
            </p>
            <GoUserRideStatsBadges
              compact
              className="mt-1"
              rating={offer.rider.rating}
              ratingCount={offer.rider.ratingCount}
              completedTrips={offer.rider.completedTrips}
            />
            <p className="mt-1 truncate text-[11px] text-muted-foreground">
              {noDestination
                ? twoWords(offer.start.label)
                : `${twoWords(offer.start.label)} → ${twoWords(offer.end!.label)}`}
            </p>
          </div>
          {!noDestination ? (
            <div className="ml-auto hidden flex-col items-end gap-0.5 sm:flex">
              <span className="text-xs text-muted-foreground">
                {formatKm(offer.distanceM)} · {formatDur(offer.durationSec)}
              </span>
            </div>
          ) : null}
        </div>

        <div className="h-[min(42vh,360px)] min-h-[200px] w-full border-b border-border">
          <TaxiRouteMap
            fullscreen
            zoomPosition="bottomleft"
            syncDefaultView={false}
            defaultCenter={[offer.start.lat, offer.start.lon]}
            defaultZoom={13}
            start={{ lat: offer.start.lat, lon: offer.start.lon, label: offer.start.label }}
            end={noDestination ? null : { lat: offer.end!.lat, lon: offer.end!.lon, label: offer.end!.label }}
            routeGeometry={noDestination ? null : offer.routeGeometry}
            extraMarkers={
              driverPos
                ? [
                    {
                      id: "driver",
                      lat: driverPos.lat,
                      lon: driverPos.lon,
                      kind: "driver" as const,
                      vehicleType: offer.vehicleType,
                    },
                  ]
                : []
            }
            onMapPick={() => {}}
            suppressMapPick
            wrapperClassName="!rounded-none !border-0 !shadow-none h-full w-full genfeb-taxi-offer-map"
          />
        </div>

        {noDestination ? (
          <div className="border-b border-border px-4 py-3">
            <p className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2.5 text-sm leading-snug text-foreground">
              {GO_RIDE_NO_DESTINATION_DRIVER_HINT}
            </p>
          </div>
        ) : (
          <>
            <div className="px-4 py-3 sm:hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2 text-sm">
                <span className="text-muted-foreground">
                  {formatKm(offer.distanceM)} · {formatDur(offer.durationSec)}
                </span>
              </div>
            </div>

            {(() => {
              const suggested = typeof offer.suggestedUsd === "number" ? offer.suggestedUsd : offer.estimatedUsd;
              const standard = isStandardOffer(offer.estimatedUsd, suggested);
              return (
                <div className="px-4 pb-1">
                  {standard ? (
                    <div className="rounded-xl border border-border bg-card/95 px-3 py-2">
                      <p className="text-xs text-muted-foreground">Referencia sugerida</p>
                      <p className="mt-0.5 text-base font-semibold tabular-nums text-foreground">{formatUsd(suggested)}</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div className="rounded-xl border border-border bg-card/95 px-3 py-2">
                        <p className="text-xs text-muted-foreground">Referencia sugerida</p>
                        <p className="mt-0.5 text-base font-semibold tabular-nums text-foreground">{formatUsd(suggested)}</p>
                      </div>
                      <div className="rounded-xl border border-primary/25 bg-primary/5 px-3 py-2">
                        <p className="text-xs text-muted-foreground">Oferta del Cliente</p>
                        <p className="mt-0.5 text-base font-semibold tabular-nums text-foreground">{formatUsd(offer.estimatedUsd)}</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </>
        )}

        <div className="flex flex-col gap-2 border-t border-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-muted/40"
            role="progressbar"
            aria-label="Tiempo restante para responder"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            title={`Expira en ${remainingSec}s`}
          >
            <div
              className="h-full bg-primary transition-[width] duration-100 ease-linear"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="destructive"
              className="flex-1 gap-2 sm:flex-initial sm:min-w-[120px]"
              disabled={busy || negotiationBusy}
              onClick={onDecline}
            >
              <Ban className="h-4 w-4" aria-hidden />
              Rechazar
            </Button>
            {isNego && !noDestination ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 gap-2"
                  disabled={negotiationBusy}
                  onClick={() => onNegotiationChangeAmount?.(offer.estimatedUsd)}
                >
                  Cambiar monto
                </Button>
                <Button
                  type="button"
                  className="flex-1 gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
                  disabled={negotiationBusy}
                  onClick={async () => {
                    await onNegotiationPropose!(offer.estimatedUsd);
                  }}
                >
                  {negotiationBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {!negotiationBusy ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : null}
                  Al precio del cliente
                </Button>
              </>
            ) : (
              <Button
                type="button"
                className="flex-1 gap-2 bg-emerald-600 text-white hover:bg-emerald-700 sm:flex-initial sm:min-w-[140px]"
                disabled={busy || negotiationBusy}
                onClick={onAccept}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {!busy ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : null}
                {busy ? "Aceptando…" : "Aceptar"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
