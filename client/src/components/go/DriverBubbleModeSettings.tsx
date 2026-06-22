import { CircleDot, Minimize2, PictureInPicture2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useGoDriverBubbleOptional } from "@/contexts/GoDriverBubbleContext";
import { cn } from "@/lib/utils";

type DriverBubbleModeSettingsProps = {
  className?: string;
  /** En el menú hamburguesa: acción compacta con botón minimizar. */
  variant?: "card" | "menu";
  onAfterAction?: () => void;
};

export function DriverBubbleModeSettings({
  className,
  variant = "card",
  onAfterAction,
}: DriverBubbleModeSettingsProps) {
  const bubble = useGoDriverBubbleOptional();
  if (!bubble?.supported) return null;

  const {
    active,
    receiving,
    pinnedInSettings,
    setPinnedInSettings,
    isMinimized,
    pipSupported,
    toggleMinimized,
  } = bubble;

  const statusLine = receiving
    ? "Activa mientras recibes servicios. Al salir de la app se minimiza sola."
    : pinnedInSettings
      ? "Mantienes la burbuja aunque no recibas servicios."
      : "Se activa sola al poner «Recibir servicios».";

  if (variant === "menu") {
    return (
      <div className={cn("rounded-xl border border-border/80 bg-muted/20 p-3", className)}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <PictureInPicture2 className="h-4 w-4 shrink-0 text-primary" aria-hidden />
              <Label htmlFor="driver-bubble-mode-menu" className="text-sm font-medium text-foreground">
                Burbuja flotante
              </Label>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{statusLine}</p>
          </div>
          <Switch
            id="driver-bubble-mode-menu"
            checked={pinnedInSettings}
            onCheckedChange={setPinnedInSettings}
            aria-label="Mantener burbuja flotante siempre"
          />
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">
          Opcional. Sin activar, la burbuja solo aparece mientras recibes taxi, delivery o híbrido.
        </p>
        {active ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-3 h-10 w-full justify-start gap-2"
            onClick={() => {
              void toggleMinimized().finally(() => onAfterAction?.());
            }}
          >
            {isMinimized ? (
              <>
                <CircleDot className="h-4 w-4 shrink-0" aria-hidden />
                Expandir panel conductor
              </>
            ) : (
              <>
                <Minimize2 className="h-4 w-4 shrink-0" aria-hidden />
                Minimizar a burbuja
              </>
            )}
          </Button>
        ) : null}
        {active && pipSupported ? (
          <p className="mt-2 text-[10px] text-muted-foreground">
            En Android Chrome la burbuja puede quedar flotando sobre otras apps.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn("rounded-xl border border-border bg-card p-4 shadow-sm", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <PictureInPicture2 className="h-5 w-5 text-primary" aria-hidden />
            Burbuja flotante (conductor)
          </h3>
          <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{statusLine}</p>
          <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
            Solo en la vista de conductor. Al cambiar de app se minimiza automáticamente para que no pierdas
            ofertas. Las notificaciones push siguen llegando.
          </p>
          {!pipSupported ? (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
              En este navegador la burbuja solo funciona dentro de la pestaña. En Android Chrome suele poder
              flotar sobre otras apps.
            </p>
          ) : null}
        </div>
        <Switch
          id="driver-bubble-mode-settings"
          checked={pinnedInSettings}
          onCheckedChange={setPinnedInSettings}
          aria-label="Mantener burbuja flotante siempre"
        />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        El interruptor es opcional: sin él, la burbuja se enciende sola al recibir servicios y se apaga al
        desactivarlo.
      </p>
      {active ? (
        <Button
          type="button"
          variant="outline"
          className="mt-4 w-full justify-start gap-2"
          onClick={() => void toggleMinimized()}
        >
          {isMinimized ? (
            <>
              <CircleDot className="h-4 w-4" aria-hidden />
              Expandir panel
            </>
          ) : (
            <>
              <Minimize2 className="h-4 w-4" aria-hidden />
              Minimizar a burbuja ahora
            </>
          )}
        </Button>
      ) : null}
    </div>
  );
}
