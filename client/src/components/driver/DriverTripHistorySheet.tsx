import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { CargoDriverTripLog } from "@/lib/cargo-driver-storage";

function formatEnded(iso: string): string {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat("es-EC", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(d);
  } catch {
    return iso;
  }
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(n);
}

type Props = {
  trips: CargoDriverTripLog[];
  triggerClassName?: string;
  triggerVariant?: "secondary" | "ghost";
  /** Icono más pequeño (barra compacta móvil). */
  compactTrigger?: boolean;
  /** Controlado desde la barra inferior (sin botón flotante). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function DriverTripHistorySheet({
  trips,
  triggerClassName,
  triggerVariant = "secondary",
  compactTrigger = false,
  open: controlledOpen,
  onOpenChange,
}: Props) {
  const isControlled = onOpenChange !== undefined;

  return (
    <Sheet
      open={isControlled ? controlledOpen ?? false : undefined}
      onOpenChange={isControlled ? onOpenChange : undefined}
    >
      {!isControlled && (
        <SheetTrigger asChild>
          <Button
            type="button"
            variant={triggerVariant}
            className={triggerClassName}
            aria-label="Historial de viajes como conductor"
          >
            <History
              className={cn("shrink-0 sm:mr-1", compactTrigger ? "h-3.5 w-3.5" : "h-5 w-5")}
            />
            <span className={cn(compactTrigger ? "sr-only" : "hidden sm:inline")}>Historial</span>
          </Button>
        </SheetTrigger>
      )}
      <SheetContent side="bottom" className="max-h-[min(85dvh,560px)] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>Viajes recientes (Car Go)</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-3 pb-6">
          {trips.length === 0 ? (
            <p className="text-sm text-muted-foreground leading-relaxed">
              Aún no hay viajes registrados como conductor. Cuando completes carreras con Car Go, aquí verás la
              duración, el monto y si el pago fue en efectivo o con saldo GenFeb.
            </p>
          ) : (
            <ul className="space-y-3">
              {trips.map((t) => (
                <li
                  key={t.id}
                  className="rounded-xl border border-border bg-card px-4 py-3 text-sm shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-foreground">{formatEnded(t.endedAt)}</span>
                    <span className="tabular-nums font-semibold text-foreground">{formatMoney(t.amountUsd)}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground text-xs">
                    <span>Duración: {t.durationMin} min</span>
                    <span>
                      Pago:{" "}
                      <span className="font-medium text-foreground">
                        {t.payment === "genfeb" ? "Saldo GenFeb" : "Efectivo"}
                      </span>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
