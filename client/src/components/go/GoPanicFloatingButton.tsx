import { useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { ShieldAlert } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Props = {
  rideId: string | null;
  /** Taxi (Car Go) o delivery (Pack Go); debe coincidir con el módulo del viaje activo. */
  goModule: "taxi" | "delivery";
  visible: boolean;
  perspective: "rider" | "driver";
  serviceLabel: string;
  /** Tras enviar la alerta con éxito: segunda pregunta para abrir el flujo de cancelación del servicio. */
  onOfferCancelAfterSuccess?: () => void;
  /** `embedded`: compacto dentro del panel del conductor (sin `fixed` ni portal raíz). */
  variant?: "floating" | "embedded";
};

/** Offset vertical compartido con controles flotantes del mapa Go (encima de GoBottomNav). */
export const GO_PANIC_FLOAT_BOTTOM =
  "bottom-[calc(var(--go-bottom-nav-height,4.75rem)+env(safe-area-inset-bottom,0px))] md:bottom-[calc(5rem+env(safe-area-inset-bottom,0px))]";

/**
 * Botón de pánico durante Genfeb Go (taxi/delivery) en curso.
 * POST `/api/go/panic` con JSON `{ rideId, module }`.
 *
 * `floating`: z-40 fijo izquierda, encima del mapa / bajo overlays z-50 del shell.
 * `embedded`: misma acción pero integrado en el panel del conductor.
 */
export function GoPanicFloatingButton({
  rideId,
  goModule,
  visible,
  perspective,
  serviceLabel,
  onOfferCancelAfterSuccess,
  variant = "floating",
}: Props) {
  const embedded = variant === "embedded";
  const [open, setOpen] = useState(false);
  const [cancelOfferOpen, setCancelOfferOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [portalTarget] = useState<HTMLElement | null>(() =>
    typeof document !== "undefined" ? document.body : null
  );
  const { toast } = useToast();

  if (!visible || !rideId) return null;
  if (!embedded && !portalTarget) return null;

  const onConfirm = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      toast({ title: "Inicia sesión", variant: "destructive" });
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/go/panic", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ rideId, module: goModule }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        toast({
          title: "No se pudo enviar la alerta",
          description: data.message ?? "Intenta de nuevo.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Alerta enviada",
        description:
          "Los administradores han sido notificados por la app. Si puedes, mantente a salvo y disponible por teléfono.",
      });
      setOpen(false);
      if (onOfferCancelAfterSuccess) setCancelOfferOpen(true);
    } catch {
      toast({ title: "Error de red", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const desc =
    perspective === "rider"
      ? `Se enviará una notificación urgente a los administradores con tus datos, tu teléfono y la información de quien tomó tu ${serviceLabel}. Úsalo solo en una emergencia real.`
      : `Se enviará una notificación urgente a los administradores con tus datos y los del cliente que inició este ${serviceLabel}. Úsalo solo en una emergencia real.`;

  const cancelOfferDesc =
    perspective === "rider"
      ? `Si quieres anular el ${serviceLabel} en este mismo instante, podemos abrir la confirmación de cancelación. Si prefieres seguir, el servicio continúa igual.`
      : `Si necesitas cortar el servicio ahora, podemos abrir la confirmación de cancelación. Si no, puedes seguir con el ${serviceLabel}.`;

  const triggerButton = embedded ? (
    <motion.button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="Botón de emergencia — enviar alerta SOS"
      whileTap={{ scale: 0.98 }}
      className={cn(
        "relative flex w-full min-h-0 items-center justify-center gap-2 overflow-hidden rounded-xl px-3 py-2",
        "border-2 border-white/90 bg-gradient-to-br from-red-600 via-red-600 to-rose-900 text-white",
        "shadow-[0_6px_20px_-6px_rgba(220,38,38,0.55),0_0_0_1px_rgba(255,255,255,0.1)_inset]",
        "ring-1 ring-red-500/45 ring-offset-1 ring-offset-background/90",
        "transition-[filter,box-shadow] hover:brightness-110",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2"
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-xl bg-[radial-gradient(circle_at_25%_15%,rgba(255,255,255,0.28),transparent_50%)]"
      />
      <motion.span
        aria-hidden
        className="pointer-events-none absolute -inset-px rounded-xl border border-red-400/55"
        animate={{ opacity: [0.25, 0.7, 0.25] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
      />
      <ShieldAlert className="relative z-[1] h-4 w-4 shrink-0 drop-shadow-sm" strokeWidth={2.25} aria-hidden />
      <span className="relative z-[1] text-[10px] font-black uppercase leading-none tracking-[0.12em]">SOS</span>
      <span className="relative z-[1] text-[10px] font-semibold leading-tight text-white/90">Emergencia</span>
    </motion.button>
  ) : (
    <motion.button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="Botón de emergencia — enviar alerta SOS"
      whileTap={{ scale: 0.96 }}
      className={cn(
        "relative flex min-h-[4.25rem] w-[4.5rem] flex-col items-center justify-center gap-0.5 overflow-hidden rounded-2xl",
        "border-2 border-white/95 bg-gradient-to-br from-red-600 via-red-600 to-rose-900",
        "text-white shadow-[0_10px_32px_-6px_rgba(220,38,38,0.75),0_0_0_1px_rgba(255,255,255,0.12)_inset]",
        "ring-2 ring-red-500/50 ring-offset-2 ring-offset-background/80",
        "transition-[filter,box-shadow] hover:brightness-110 hover:shadow-[0_12px_36px_-4px_rgba(220,38,38,0.85)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2"
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.35),transparent_55%)]"
      />
      <motion.span
        aria-hidden
        className="pointer-events-none absolute -inset-1 rounded-2xl border-2 border-red-400/70"
        animate={{ opacity: [0.35, 0.85, 0.35], scale: [1, 1.06, 1] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
      />
      <ShieldAlert className="relative z-[1] h-6 w-6 shrink-0 drop-shadow-sm" strokeWidth={2.25} aria-hidden />
      <span className="relative z-[1] text-[10px] font-black uppercase leading-none tracking-[0.14em]">SOS</span>
      <span className="relative z-[1] text-[9px] font-semibold leading-tight text-white/90">Emergencia</span>
    </motion.button>
  );

  const dialogs = (
    <>
      <AlertDialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <AlertDialogContent className="max-w-md border-red-500/25">
          <AlertDialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/15 ring-1 ring-red-500/30">
              <ShieldAlert className="h-6 w-6 text-red-600 dark:text-red-400" aria-hidden />
            </div>
            <AlertDialogTitle className="text-center">¿Activar alerta de emergencia?</AlertDialogTitle>
            <AlertDialogDescription className="text-left">{desc}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>No, volver</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              onClick={(e) => {
                e.preventDefault();
                void onConfirm();
              }}
              disabled={busy}
              className="bg-gradient-to-r from-red-600 to-rose-700 text-white hover:from-red-700 hover:to-rose-800 focus-visible:ring-red-500"
            >
              {busy ? "Enviando…" : "Sí, enviar alerta SOS"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {onOfferCancelAfterSuccess ? (
        <AlertDialog open={cancelOfferOpen} onOpenChange={setCancelOfferOpen}>
          <AlertDialogContent className="max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle>¿Cancelar el {serviceLabel} ahora?</AlertDialogTitle>
              <AlertDialogDescription className="text-left">{cancelOfferDesc}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>No, continuar el {serviceLabel}</AlertDialogCancel>
              <AlertDialogAction
                type="button"
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={(e) => {
                  e.preventDefault();
                  setCancelOfferOpen(false);
                  onOfferCancelAfterSuccess();
                }}
              >
                Sí, quiero cancelar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </>
  );

  const tree = embedded ? (
    <div className="w-full shrink-0">
      {triggerButton}
      {dialogs}
    </div>
  ) : (
    <>
      <motion.div
        initial={{ opacity: 0, scale: 0.88, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 420, damping: 28 }}
        className={cn("pointer-events-auto fixed left-3 z-40 md:left-5", GO_PANIC_FLOAT_BOTTOM)}
      >
        {triggerButton}
      </motion.div>
      {dialogs}
    </>
  );

  if (embedded) return tree;
  return createPortal(tree, portalTarget!);
}
