import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { Banknote, Building2, Loader2, Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type TaxiVehicleKind = "moto" | "auto" | "pet_car" | "camioneta";

export type TaxiVehicleModalStep =
  | "pick"
  | "price_mode"
  | "haggle"
  | "payment"
  | "extras"
  | "ready"
  | "searching"
  | "done";

export type TaxiPaymentMethod = "cash" | "bank_transfer";

type VehicleOption = { type: TaxiVehicleKind; label: string; Icon: LucideIcon; description?: string };

const TAXI_MODAL_Z = 2_147_482_000;

function formatMmSs(totalSec: number): string {
  const s = Math.max(0, Math.ceil(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function formatUsd(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return `$${v.toFixed(2)}`;
}

export function TaxiVehicleSearchModal({
  open,
  onOpenChange,
  step,
  vehicleOptions,
  selectedType,
  onSelectType,
  onConfirmSearch,
  onBackToPick,
  onBackToPayment,
  selectedPayment,
  onSelectPayment,
  onPaymentContinue,
  searchRemainingSec,
  searchTotalSec,
  suggestedUsdByVehicle,
  suggestedUsd,
  /** Si existe, “Cancelar búsqueda” abre confirmación en el padre (cancela el viaje en servidor). */
  onRequestCancelSearch,
  isNegotiatedFlow = false,
  clientOfferUsd = null,
  onChooseStandardPrice,
  onChooseHaggle,
  haggleUsd = 0,
  onHaggleBump,
  onHaggleDecide,
  onBackFromHaggle,
  onBackFromPriceMode,
  onBackToHaggleFromPayment,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  step: TaxiVehicleModalStep;
  vehicleOptions: ReadonlyArray<VehicleOption>;
  selectedType: TaxiVehicleKind | null;
  onSelectType: (t: TaxiVehicleKind) => void;
  onConfirmSearch: () => void;
  onBackToPick: () => void;
  onBackToPayment: () => void;
  selectedPayment: TaxiPaymentMethod | null;
  onSelectPayment: (m: TaxiPaymentMethod) => void;
  onPaymentContinue: () => void;
  searchRemainingSec: number;
  searchTotalSec: number;
  suggestedUsdByVehicle: Partial<Record<TaxiVehicleKind, number>>;
  suggestedUsd: number | null;
  onRequestCancelSearch?: () => void;
  isNegotiatedFlow?: boolean;
  clientOfferUsd?: number | null;
  onChooseStandardPrice?: () => void;
  onChooseHaggle?: () => void;
  haggleUsd?: number;
  onHaggleBump?: (delta: number) => void;
  onHaggleDecide?: () => void;
  onBackFromHaggle?: () => void;
  onBackFromPriceMode?: () => void;
  onBackToHaggleFromPayment?: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    const prevOverflow = document.body.style.overflow;
    const searching = step === "searching";
    if (!searching) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onOpenChange, step]);

  if (typeof document === "undefined") return null;

  const searching = step === "searching";
  const done = step === "done";
  const compactBottom = searching || done;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          key="taxi-vehicle-flow-root"
          className={cn(
            // max-md: evitar `justify-end` en el contenedor: en algunos navegadores el hijo flex
            // hereda altura y el panel crece a pantalla completa (hueco blanco bajo la grilla).
            // El panel se ancla abajo con `max-md:mt-auto` en el role=dialog.
            "flex min-h-0 justify-center max-md:flex-col md:items-center md:justify-center",
            compactBottom
              ? "pointer-events-none items-end justify-end p-0 sm:items-end sm:justify-end sm:p-4"
              : "pointer-events-auto max-md:p-0 md:p-4"
          )}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: TAXI_MODAL_Z,
            isolation: "isolate",
            height: "100dvh",
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          <div
            className={cn(
              "absolute inset-0 transition-colors duration-300",
              searching || done
                ? "bg-neutral-950/25 backdrop-blur-[1px]"
                : "bg-neutral-950/60 backdrop-blur-[3px] max-md:bg-black/25 max-md:backdrop-blur-[2px]"
            )}
            role="presentation"
            aria-hidden
            onClick={searching || done ? undefined : () => onOpenChange(false)}
            style={searching || done ? { pointerEvents: "none" } : undefined}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="taxi-vehicle-modal-title"
            className={cn(
              // Importante: NO usar `grid` aquí: con pocos hijos, `gap-*` crea “huecos enormes”
              // entre el header y el contenido (se ve peor tras recargar / primer paint móvil).
              "relative z-10 flex h-auto max-h-[min(92dvh,720px)] min-h-0 shrink-0 flex-col gap-3 overflow-y-auto rounded-xl border border-border shadow-xl",
              compactBottom
                ? "pointer-events-auto w-full max-w-lg rounded-b-none border-b-0 bg-background px-4 py-4 sm:rounded-xl sm:border sm:px-6 sm:py-5 sm:pb-6"
                : cn(
                    "w-full max-w-lg bg-background",
                    "max-md:mt-auto max-md:max-h-[min(92dvh,720px)] max-md:w-full max-md:max-w-none max-md:rounded-b-none max-md:rounded-t-2xl max-md:border-x-0 max-md:border-b-0 max-md:bg-background/[0.78] max-md:px-3 max-md:py-3 max-md:pb-[max(0.75rem,env(safe-area-inset-bottom))] max-md:pt-3 max-md:backdrop-blur-md max-md:shadow-[0_-12px_40px_rgba(0,0,0,0.12)]",
                    "md:max-h-[min(85vh,40rem)] md:border md:border-border md:p-6",
                    "pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))] max-md:pb-[max(0.75rem,env(safe-area-inset-bottom))] max-md:pt-3"
                  )
            )}
            onPointerDown={(e) => e.stopPropagation()}
            initial={
              compactBottom
                ? { opacity: 0, y: 48 }
                : { opacity: 0, scale: 0.94, y: 18 }
            }
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={
              compactBottom
                ? { type: "spring", damping: 28, stiffness: 340 }
                : { type: "spring", damping: 26, stiffness: 320, mass: 0.85 }
            }
          >
            {!searching && (
              <button
                type="button"
                className="absolute right-3 top-3 rounded-sm p-2 text-muted-foreground opacity-80 ring-offset-background transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => onOpenChange(false)}
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            )}

            {step === "pick" && (
              <>
                <div className="space-y-1 pr-8 text-left max-md:pr-10">
                  <h2
                    id="taxi-vehicle-modal-title"
                    className="text-base font-semibold leading-tight tracking-tight text-foreground md:text-lg md:leading-none"
                  >
                    Tipo de vehículo
                  </h2>
                  <p className="text-xs leading-snug text-muted-foreground md:text-sm md:leading-normal">
                    Calculamos una referencia sugerida basada en tarifas de la plataforma.
                  </p>
                </div>

                <motion.div
                  className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 sm:gap-3"
                  initial="hidden"
                  animate="show"
                  variants={{
                    hidden: {},
                    show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
                  }}
                >
                  {vehicleOptions.map(({ type, label, Icon, description }) => {
                    const sug = typeof suggestedUsdByVehicle?.[type] === "number" ? (suggestedUsdByVehicle[type] as number) : null;
                    return (
                    <motion.div
                      key={type}
                      variants={{
                        hidden: { opacity: 0, y: 10 },
                        show: { opacity: 1, y: 0, transition: { duration: 0.26, ease: [0.22, 1, 0.36, 1] } },
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => onSelectType(type)}
                        className={cn(
                          "flex w-full flex-col items-center gap-1 rounded-lg border-2 p-2 text-center transition-colors sm:gap-2 sm:rounded-xl sm:p-4",
                          "hover:border-primary/60 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                          selectedType === type ? "border-primary bg-primary/5" : "border-border bg-card/95"
                        )}
                      >
                        <Icon className="h-7 w-7 shrink-0 text-primary sm:h-9 sm:w-9" aria-hidden />
                        <span className="text-xs font-semibold text-foreground sm:text-sm">{label}</span>
                        {description ? (
                          <span className="line-clamp-2 text-[10px] leading-tight text-muted-foreground sm:text-[11px]">
                            {description}
                          </span>
                        ) : null}
                        <span className="text-[11px] sm:text-xs text-muted-foreground tabular-nums">
                          {sug == null ? "—" : `Ref. ${formatUsd(sug)}`}
                        </span>
                      </button>
                    </motion.div>
                  );
                  })}
                </motion.div>
              </>
            )}

            {step === "price_mode" && selectedType && (
              <motion.div
                className="flex flex-col gap-4"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="space-y-1.5 pr-8 text-left">
                  <h2 id="taxi-vehicle-modal-title" className="text-lg font-semibold leading-none tracking-tight text-foreground">
                    Precio del viaje
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Vehículo:{" "}
                    <span className="font-medium text-foreground">
                      {vehicleOptions.find((o) => o.type === selectedType)?.label}
                    </span>
                    . Referencia:{" "}
                    <span className="font-semibold tabular-nums text-foreground">
                      {suggestedUsd == null ? "—" : formatUsd(suggestedUsd)}
                    </span>
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => onChooseStandardPrice?.()}
                    className={cn(
                      "flex flex-col gap-1 rounded-xl border-2 p-4 text-left transition-colors",
                      "hover:border-primary/60 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      "border-border bg-card"
                    )}
                  >
                    <span className="font-semibold text-foreground">Ir con el precio indicado</span>
                    <span className="text-xs text-muted-foreground">Usamos la referencia sugerida y buscamos conductor como siempre.</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onChooseHaggle?.()}
                    className={cn(
                      "flex flex-col gap-1 rounded-xl border-2 p-4 text-left transition-colors",
                      "hover:border-primary/60 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      "border-primary/40 bg-primary/5"
                    )}
                  >
                    <span className="font-semibold text-foreground">Regatear precio</span>
                    <span className="text-xs text-muted-foreground">Ajusta el monto; los conductores podrán proponerte su oferta.</span>
                  </button>
                </div>
                <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => onBackFromPriceMode?.()}>
                  Cambiar tipo de vehículo
                </Button>
              </motion.div>
            )}

            {step === "haggle" && selectedType && (
              <motion.div
                className="flex flex-col gap-4"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="space-y-1.5 pr-8 text-left">
                  <h2 id="taxi-vehicle-modal-title" className="text-lg font-semibold leading-none tracking-tight text-foreground">
                    Regatear precio
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Referencia: {suggestedUsd == null ? "—" : formatUsd(suggestedUsd)}. Ajusta tu oferta con + y −.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-4 rounded-xl border border-border bg-muted/30 py-4">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-12 w-12 shrink-0 rounded-full"
                    aria-label="Bajar precio"
                    onClick={() => onHaggleBump?.(-0.25)}
                  >
                    <Minus className="h-5 w-5" />
                  </Button>
                  <div className="min-w-[7rem] text-center">
                    <p className="text-xs text-muted-foreground">Tu oferta</p>
                    <p className="text-2xl font-bold tabular-nums text-foreground">{formatUsd(haggleUsd)}</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-12 w-12 shrink-0 rounded-full"
                    aria-label="Subir precio"
                    onClick={() => onHaggleBump?.(0.25)}
                  >
                    <Plus className="h-5 w-5" />
                  </Button>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <Button type="button" variant="ghost" size="sm" onClick={() => onBackFromHaggle?.()}>
                    Volver
                  </Button>
                  <Button type="button" size="lg" className="w-full sm:w-auto" onClick={() => onHaggleDecide?.()}>
                    Decidir este precio
                  </Button>
                </div>
              </motion.div>
            )}

            {step === "payment" && selectedType && (
              <motion.div
                className="flex flex-col gap-4"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="space-y-1.5 pr-8 text-left">
                  <h2 id="taxi-vehicle-modal-title" className="text-lg font-semibold leading-none tracking-tight text-foreground">
                    ¿Con qué deseas pagar?
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Vehículo:{" "}
                    <span className="font-medium text-foreground">
                      {vehicleOptions.find((o) => o.type === selectedType)?.label}
                    </span>{" "}
                    · Pago directo al conductor
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => onSelectPayment("cash")}
                    className={cn(
                      "flex flex-col gap-2 rounded-xl border-2 p-4 text-left transition-colors",
                      "hover:border-primary/60 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      selectedPayment === "cash" ? "border-primary bg-primary/5" : "border-border bg-card"
                    )}
                  >
                    <span className="flex items-center gap-2 font-semibold text-foreground">
                      <Banknote className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                      Efectivo
                    </span>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Recuerda tener el dinero <strong className="text-foreground">completo</strong>.
                    </p>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => onSelectPayment("bank_transfer")}
                  className={cn(
                    "flex flex-col gap-2 rounded-xl border-2 p-4 text-left transition-colors",
                    "hover:border-primary/60 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    selectedPayment === "bank_transfer" ? "border-primary bg-primary/5" : "border-border bg-card"
                  )}
                >
                  <span className="flex items-center gap-2 font-semibold text-foreground">
                    <Building2 className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                    Transferencia bancaria
                  </span>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Habla y/o escribe con el Driver para pedir sus datos.
                  </p>
                </button>

                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="ghost" size="sm" className="self-start sm:self-center" onClick={onBackToPick}>
                      Cambiar tipo de vehículo
                    </Button>
                    {isNegotiatedFlow && onBackToHaggleFromPayment ? (
                      <Button type="button" variant="ghost" size="sm" onClick={onBackToHaggleFromPayment}>
                        Ajustar oferta
                      </Button>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    size="lg"
                    className="w-full sm:w-auto"
                    disabled={!selectedPayment}
                    onClick={onPaymentContinue}
                  >
                    Continuar
                  </Button>
                </div>
              </motion.div>
            )}

            {step === "ready" && selectedType && selectedPayment && (
              <motion.div
                className="flex flex-col gap-4"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="space-y-3 pr-8 text-left">
                  <h2 id="taxi-vehicle-modal-title" className="text-lg font-semibold leading-none tracking-tight text-foreground">
                    ¿Todo listo para buscar a tu conductor?
                  </h2>
                  <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
                    Revisa:{" "}
                    <span className="font-medium">{vehicleOptions.find((o) => o.type === selectedType)?.label}</span> ·{" "}
                    {selectedPayment === "cash" ? "Efectivo al conductor" : "Transferencia bancaria"}
                  </p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    El pago es directo con el driver. La plataforma solo muestra una <strong className="text-foreground">referencia sugerida</strong>.
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="rounded-xl border border-border bg-card/95 p-3">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-muted-foreground">Referencia sugerida</span>
                      <span className="font-semibold tabular-nums text-foreground">
                        {suggestedUsd == null ? "—" : formatUsd(suggestedUsd)}
                      </span>
                    </div>
                  </div>
                  {isNegotiatedFlow && clientOfferUsd != null ? (
                    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="text-muted-foreground">Tu oferta (regateo)</span>
                        <span className="font-semibold tabular-nums text-foreground">{formatUsd(clientOfferUsd)}</span>
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={onBackToPick}>
                      Cambiar tipo
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={onBackToPayment}>
                      Cambiar pago
                    </Button>
                  </div>
                  <Button
                    type="button"
                    size="lg"
                    className="w-full sm:w-auto"
                    onClick={onConfirmSearch}
                    disabled={suggestedUsd == null}
                  >
                    Buscar conductor
                  </Button>
                </div>
              </motion.div>
            )}

            {searching && (
              <div className="space-y-3 pt-1">
                <div className="flex items-start gap-3">
                  <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-primary" aria-hidden />
                  <div>
                    <p className="font-medium text-foreground">Buscando vehículos en el área</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Estamos buscando un driver compatible cerca de ti.
                    </p>
                  </div>
                </div>
                <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">Tiempo estimado de búsqueda: </span>
                  <span className="font-mono font-semibold tabular-nums text-foreground">{formatMmSs(searchRemainingSec)}</span>
                  <span className="text-muted-foreground"> / {formatMmSs(searchTotalSec)}</span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => (onRequestCancelSearch ? onRequestCancelSearch() : onOpenChange(false))}
                >
                  Cancelar búsqueda
                </Button>
              </div>
            )}

            {done && (
              <div className="space-y-3 pt-1">
                <p className="font-medium text-foreground">Búsqueda finalizada</p>
                <p className="text-sm text-muted-foreground">
                  No encontramos un driver disponible ahora para este vehículo. Puedes intentar cambiar el tipo (por ejemplo, moto).
                </p>
                <Button type="button" className="w-full" onClick={() => onOpenChange(false)}>
                  Entendido
                </Button>
              </div>
            )}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
