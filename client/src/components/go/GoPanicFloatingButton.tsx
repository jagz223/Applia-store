import { useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
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

type Props = {
  rideId: string | null;
  /** Taxi (Car Go) o delivery (Pack Go); debe coincidir con el módulo del viaje activo. */
  goModule: "taxi" | "delivery";
  visible: boolean;
  perspective: "rider" | "driver";
  serviceLabel: string;
  /** Tras enviar la alerta con éxito: segunda pregunta para abrir el flujo de cancelación del servicio. */
  onOfferCancelAfterSuccess?: () => void;
};

/**
 * Botón de pánico durante Genfeb Go (taxi/delivery) en curso.
 * POST `/api/go/panic` con JSON `{ rideId, module }`.
 */
export function GoPanicFloatingButton({
  rideId,
  goModule,
  visible,
  perspective,
  serviceLabel,
  onOfferCancelAfterSuccess,
}: Props) {
  const [open, setOpen] = useState(false);
  const [cancelOfferOpen, setCancelOfferOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [portalTarget] = useState<HTMLElement | null>(() =>
    typeof document !== "undefined" ? document.body : null
  );
  const { toast } = useToast();

  if (!visible || !rideId) return null;
  if (!portalTarget) return null;

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

  return createPortal(
    <>
      {/*
        Portal a `body`: evita recorte por `overflow-hidden` del layout Go y queda por encima del mapa
        a pantalla completa (`z-[100]` en TaxiRide).
      */}
      <div className="pointer-events-auto fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-3 z-[120] md:bottom-5 md:right-6">
        <Button
          type="button"
          size="lg"
          className="h-14 min-w-[7.5rem] rounded-full border-2 border-red-800 bg-red-600 px-4 text-base font-semibold text-white shadow-lg hover:bg-red-700 focus-visible:ring-red-500"
          onClick={() => setOpen(true)}
          aria-label="Botón de pánico — emergencia"
        >
          <AlertTriangle className="mr-2 h-5 w-5 shrink-0" aria-hidden />
          Pánico
        </Button>
      </div>

      <AlertDialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Seguro que quieres activar el botón de pánico?</AlertDialogTitle>
            <AlertDialogDescription className="text-left">{desc}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>No, cancelar</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              onClick={(e) => {
                e.preventDefault();
                void onConfirm();
              }}
              disabled={busy}
              className="bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500"
            >
              {busy ? "Enviando…" : "Sí, enviar alerta"}
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
    </>,
    portalTarget
  );
}
