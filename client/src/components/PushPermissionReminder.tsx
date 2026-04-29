import { useEffect, useMemo, useState } from "react";
import { BellRing, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePushNotifications } from "@/hooks/use-push-notifications";

export function PushPermissionReminder({ className }: { className?: string }) {
  const push = usePushNotifications();
  const [dismissed, setDismissed] = useState(false);

  const shouldShow = useMemo(() => {
    if (dismissed) return false;
    if (!push.isSupported) return false;
    if (push.permission === "unsupported") return false;
    // Si ya están activas y con token, no molestar.
    if (push.permission === "granted" && push.token) return false;
    // Si el usuario las bloqueó, igual recordamos (solo informativo).
    return push.permission !== "granted";
  }, [dismissed, push.isSupported, push.permission, push.token]);

  // Reset del “dismiss” si el usuario cambia manualmente permisos y vuelve.
  useEffect(() => {
    if (push.permission === "granted" && push.token) setDismissed(true);
  }, [push.permission, push.token]);

  if (!shouldShow) return null;

  const blocked = push.permission === "denied";

  return (
    <div
      className={[
        "pointer-events-auto w-full flex items-start gap-3 rounded-2xl border border-border/70 bg-background/95 p-3 shadow-md backdrop-blur",
        className ?? "",
      ].join(" ")}
      role="status"
      aria-label="Recordatorio de notificaciones"
    >
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <BellRing className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">Activa las notificaciones</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {blocked
            ? "Las notificaciones están bloqueadas. Actívalas en la configuración del navegador para no perder servicios."
            : "Recibe avisos aunque cierres la app (servicios, mensajes y alertas importantes)."}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            className="h-8"
            onClick={() => push.register()}
            disabled={blocked || push.isRegistering}
          >
            {blocked ? "Bloqueadas" : push.isRegistering ? "Activando…" : "Activar ahora"}
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => setDismissed(true)}>
            Más tarde
          </Button>
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        aria-label="Cerrar recordatorio"
        onClick={() => setDismissed(true)}
      >
        <X className="h-4 w-4" aria-hidden />
      </Button>
    </div>
  );
}

