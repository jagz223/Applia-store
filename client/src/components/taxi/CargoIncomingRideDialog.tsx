import type { GeoJsonObject } from "geojson";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Ban, CheckCircle2, Loader2, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TaxiRouteMap } from "@/components/taxi/TaxiRouteMap";
export type CargoRideOfferPayload = {
  rideId: string;
  rider: {
    name: string;
    lastName?: string;
    profileImageUrl: string | null;
    phone?: string;
    rating?: number;
    ratingCount?: number;
    completedTrips?: number;
  };
  start: { lat: number; lon: number; label: string };
  end: { lat: number; lon: number; label: string };
  routeGeometry: GeoJsonObject | null;
  distanceM: number;
  durationSec: number;
  vehicleType: string;
  paymentMethod: string;
  estimatedUsd: number;
  petEnabled?: boolean;
  expiresAt?: number;
};

type Props = {
  open: boolean;
  offer: CargoRideOfferPayload | null;
  module?: "cargo" | "pack";
  busy?: boolean;
  driverPos?: { lat: number; lon: number } | null;
  onAccept: () => void;
  onDecline: () => void;
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
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(n);
}

function twoWords(label: string): string {
  const parts = String(label ?? "")
    .trim()
    .split(/\s+/g)
    .filter(Boolean);
  return parts.slice(0, 2).join(" ") || "Punto";
}

export function CargoIncomingRideDialog({ open, offer, module, busy, driverPos, onAccept, onDecline }: Props) {
  if (!open || !offer) return null;
  if (typeof document === "undefined") return null;
  const riderStars = typeof offer.rider.rating === "number" ? offer.rider.rating : null;
  const riderTrips = typeof offer.rider.completedTrips === "number" ? offer.rider.completedTrips : null;
  const title = module === "pack" ? "Pack Go" : "Car Go";

  const ttlMsRef = useRef<number>(18_000);
  const [remainingMs, setRemainingMs] = useState<number>(() => {
    const exp = typeof offer.expiresAt === "number" ? offer.expiresAt : null;
    return exp ? Math.max(0, exp - Date.now()) : ttlMsRef.current;
  });

  useEffect(() => {
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

  const progress = useMemo(() => {
    const ttl = Math.max(1, ttlMsRef.current);
    return Math.max(0, Math.min(1, remainingMs / ttl));
  }, [remainingMs]);
  const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));

  return createPortal(
    <div
      className="fixed inset-0 z-[2147483000] flex flex-col justify-end bg-black/55 pb-[calc(env(safe-area-inset-bottom,0px)+10.5rem)] backdrop-blur-sm md:justify-center md:p-4 md:pb-4"
      role="dialog"
      aria-modal
      aria-labelledby="cargo-offer-title"
    >
      <div className="flex max-h-[min(88dvh,740px)] w-full flex-col overflow-hidden rounded-t-2xl border border-border bg-background shadow-2xl md:mx-auto md:max-w-lg md:rounded-2xl">
        <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h2 id="cargo-offer-title" className="font-display text-lg font-bold text-foreground">
              Nueva solicitud · {title}
            </h2>
            <p className="text-sm text-muted-foreground">Solo lo esencial para decidir</p>
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
              {offer.paymentMethod === "genfeb"
                ? "Pago: Saldo GenFeb"
                : offer.paymentMethod === "cash"
                  ? "Pago: Efectivo"
                  : "Pago: Transferencia bancaria"}
              {offer.petEnabled ? " · Pet Car" : ""}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              {riderStars != null ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted/40 px-2 py-0.5">
                  <Star className="h-3 w-3 text-amber-500" aria-hidden />
                  <span className="font-medium text-foreground tabular-nums">{riderStars.toFixed(1)}</span>
                </span>
              ) : null}
              {riderTrips != null ? (
                <span className="rounded-full border border-border/70 bg-muted/40 px-2 py-0.5">
                  <span className="font-medium text-foreground tabular-nums">{riderTrips}</span> viajes
                </span>
              ) : null}
              <span className="truncate">
                {twoWords(offer.start.label)} → {twoWords(offer.end.label)}
              </span>
            </div>
          </div>
          <div className="ml-auto hidden flex-col items-end gap-0.5 sm:flex">
            <span className="text-xs text-muted-foreground">
              {formatKm(offer.distanceM)} · {formatDur(offer.durationSec)}
            </span>
            <span className="font-display text-lg font-bold tabular-nums text-primary">{formatUsd(offer.estimatedUsd)}</span>
          </div>
        </div>

        <div className="h-[min(42vh,360px)] min-h-[200px] w-full border-b border-border">
          <TaxiRouteMap
            fullscreen
            zoomPosition="bottomleft"
            syncDefaultView={false}
            defaultCenter={[offer.start.lat, offer.start.lon]}
            defaultZoom={13}
            start={{ lat: offer.start.lat, lon: offer.start.lon, label: offer.start.label }}
            end={{ lat: offer.end.lat, lon: offer.end.lon, label: offer.end.label }}
            routeGeometry={offer.routeGeometry}
            extraMarkers={
              driverPos ? [{ id: "driver", lat: driverPos.lat, lon: driverPos.lon, kind: "driver" }] : []
            }
            onMapPick={() => {}}
            suppressMapPick
            wrapperClassName="!rounded-none !border-0 !shadow-none h-full w-full genfeb-taxi-offer-map"
          />
        </div>

        <div className="px-4 py-3 sm:hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2 text-sm">
            <span className="text-muted-foreground">
              {formatKm(offer.distanceM)} · {formatDur(offer.durationSec)}
            </span>
            <span className="font-display text-lg font-bold tabular-nums text-primary">{formatUsd(offer.estimatedUsd)}</span>
          </div>
        </div>

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
          <div className="flex gap-2">
          <Button
            type="button"
            variant="destructive"
            className="flex-1 gap-2"
            disabled={busy}
            onClick={onDecline}
          >
            <Ban className="h-4 w-4" aria-hidden />
            Rechazar
          </Button>
          <Button
            type="button"
            className="flex-1 gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
            disabled={busy}
            onClick={onAccept}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {!busy ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : null}
            Aceptar
          </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
