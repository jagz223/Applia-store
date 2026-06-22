import { useCallback, useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  checkAndroidOverlayPermissionAfterReturn,
  consumeAndroidOverlayResult,
  type AndroidOverlayPermissionResult,
} from "@/lib/android-driver-foreground";
import { isAndroidInstalledWebApp } from "@/lib/go-driver-bubble-capability";

type AndroidOverlayPermissionFeedbackProps = {
  enabled?: boolean;
};

/**
 * Solo en `/go/driver`: popups al volver de ajustes tras «Activar burbuja».
 */
export function AndroidOverlayPermissionFeedback({ enabled = true }: AndroidOverlayPermissionFeedbackProps) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<AndroidOverlayPermissionResult | null>(null);

  const showResult = useCallback((value: AndroidOverlayPermissionResult) => {
    setResult(value);
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!enabled || !isAndroidInstalledWebApp()) return;

    const fromUrl = consumeAndroidOverlayResult();
    if (fromUrl) showResult(fromUrl);

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const urlResult = consumeAndroidOverlayResult();
      if (urlResult) {
        showResult(urlResult);
        return;
      }
      checkAndroidOverlayPermissionAfterReturn();
    };

    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [enabled, showResult]);

  if (!result) return null;

  const granted = result === "granted";

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{granted ? "Burbuja activada" : "Burbuja no activada"}</AlertDialogTitle>
          <AlertDialogDescription>
            {granted
              ? "La burbuja flotante ya está disponible. Al minimizar la app verás el globo para volver rápido."
              : "No se activó el permiso de mostrar encima de otras apps. Puedes intentarlo de nuevo con «Activar burbuja»."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction>Cerrar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
