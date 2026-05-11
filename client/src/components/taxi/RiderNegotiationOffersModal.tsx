import { createPortal } from "react-dom";
import { Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type RiderNegotiationOfferRow = {
  driverUserId: string;
  amountUsd: number;
  driver: {
    name: string;
    profileImageUrl: string | null;
    rating?: number;
    completedTrips?: number;
    vehicle: {
      type: string;
      brand: string;
      model: string;
      licensePlate: string;
    } | null;
  };
};

function formatUsd(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return `$${v.toFixed(2)}`;
}

function vehicleLabel(v: RiderNegotiationOfferRow["driver"]["vehicle"]): string {
  if (!v) return "Vehículo no registrado";
  const bits = [v.brand, v.model].filter(Boolean).join(" ").trim();
  return bits || v.type;
}

type Props = {
  open: boolean;
  rideId: string | null;
  offers: RiderNegotiationOfferRow[];
  /** Monto que ofreciste al publicar la búsqueda (referencia vs. cada conductor). */
  riderReferenceUsd?: number | null;
  busyDriverId: string | null;
  onDismissOffer: (driverUserId: string) => void;
  onAcceptOffer: (driverUserId: string) => void;
  /** Cancela el servicio en servidor (confirmación en el padre). */
  onCancelSearch: () => void;
  /** Texto del botón inferior (p. ej. envío vs viaje). */
  cancelSearchLabel?: string;
};

function offerDeltaLabel(driverUsd: number, riderUsd: number): string {
  const d = Math.round((driverUsd - riderUsd) * 100) / 100;
  if (Math.abs(d) < 0.01) return "Igual a tu oferta original.";
  if (d > 0) return `${formatUsd(d)} por encima de tu oferta.`;
  return `${formatUsd(-d)} por debajo de tu oferta.`;
}

export function RiderNegotiationOffersModal({
  open,
  rideId,
  offers,
  riderReferenceUsd = null,
  busyDriverId,
  onDismissOffer,
  onAcceptOffer,
  onCancelSearch,
  cancelSearchLabel = "Cancelar búsqueda",
}: Props) {
  if (!open || !rideId) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 flex flex-col justify-end bg-black/50 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-sm md:items-center md:justify-center md:p-4"
      role="dialog"
      aria-modal
      aria-labelledby="nego-offers-title"
      style={{ zIndex: 2_147_483_000 }}
    >
      <div className="flex max-h-[min(88dvh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
        <div className="border-b border-border px-4 py-3">
          <h2 id="nego-offers-title" className="text-base font-semibold text-foreground">
            Ofertas de conductores
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Elige una oferta o descarta las que no te convengan. La lista se actualiza en vivo.
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {offers.length === 0 ? (
            <p className="px-2 py-8 text-center text-sm text-muted-foreground">
              Aún no hay ofertas. Espera unos segundos…
            </p>
          ) : (
            <ul className="space-y-2">
              {offers.map((o) => {
                const busy = busyDriverId === o.driverUserId;
                return (
                  <li
                    key={o.driverUserId}
                    className="flex gap-3 rounded-xl border border-border bg-card/90 p-3 shadow-sm"
                  >
                    {o.driver.profileImageUrl ? (
                      <img
                        src={o.driver.profileImageUrl}
                        alt=""
                        className="h-14 w-14 shrink-0 rounded-full object-cover ring-1 ring-border"
                      />
                    ) : (
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-muted text-lg font-semibold text-muted-foreground">
                        {o.driver.name.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground">{o.driver.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{vehicleLabel(o.driver.vehicle)}</p>
                      {o.driver.vehicle?.licensePlate ? (
                        <p className="text-[11px] text-muted-foreground">
                          Placa: <span className="font-mono text-foreground">{o.driver.vehicle.licensePlate}</span>
                        </p>
                      ) : null}
                      <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                        {typeof o.driver.rating === "number" ? (
                          <span className="rounded-full border border-border/70 bg-muted/40 px-2 py-0.5">
                            ⭐ {o.driver.rating.toFixed(1)}
                          </span>
                        ) : null}
                        {typeof o.driver.completedTrips === "number" ? (
                          <span className="rounded-full border border-border/70 bg-muted/40 px-2 py-0.5">
                            {o.driver.completedTrips} viajes
                          </span>
                        ) : null}
                      </div>
                      {typeof riderReferenceUsd === "number" && Number.isFinite(riderReferenceUsd) ? (
                        <div className="mt-2 space-y-1">
                          <div className="grid grid-cols-2 gap-2 rounded-lg border border-border/80 bg-muted/30 px-2 py-1.5 text-[11px]">
                            <div>
                              <p className="text-muted-foreground">Tu oferta</p>
                              <p className="font-semibold tabular-nums text-foreground">{formatUsd(riderReferenceUsd)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Propone</p>
                              <p className="font-semibold tabular-nums text-primary">{formatUsd(o.amountUsd)}</p>
                            </div>
                          </div>
                          <p className="text-[11px] leading-snug text-muted-foreground">{offerDeltaLabel(o.amountUsd, riderReferenceUsd)}</p>
                        </div>
                      ) : (
                        <p className="mt-2 text-lg font-semibold tabular-nums text-primary">{formatUsd(o.amountUsd)}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col justify-center gap-2">
                      <Button
                        type="button"
                        size="icon"
                        variant="destructive"
                        className="h-10 w-10 rounded-full"
                        disabled={busy}
                        aria-label="Descartar oferta"
                        onClick={() => onDismissOffer(o.driverUserId)}
                      >
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        className={cn("h-10 w-10 rounded-full bg-emerald-600 text-white hover:bg-emerald-700")}
                        disabled={busy}
                        aria-label="Aceptar oferta"
                        onClick={() => onAcceptOffer(o.driverUserId)}
                      >
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="shrink-0 border-t border-border bg-background px-3 py-3">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={busyDriverId != null}
            onClick={onCancelSearch}
          >
            {cancelSearchLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
