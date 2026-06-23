import { CircleDot, Minimize2, PictureInPicture2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { useGoDriverBubbleOptional } from "@/contexts/GoDriverBubbleContext";
import { requestAndroidOverlayPermissionForDriver } from "@/lib/android-driver-foreground";
import { isAndroidTwaApp, isAndroidMobile } from "@/lib/go-driver-bubble-capability";
import { cn } from "@/lib/utils";

type DriverBubbleModeSettingsProps = {
  className?: string;
  variant?: "card" | "menu";
  onAfterAction?: () => void;
};

function isUnifiedDriverRoute(location: string): boolean {
  return location === "/go/driver" || location.startsWith("/go/driver/");
}

export function DriverBubbleModeSettings({
  className,
  variant = "card",
  onAfterAction,
}: DriverBubbleModeSettingsProps) {
  const [location] = useLocation();
  const bubble = useGoDriverBubbleOptional();

  if (isAndroidMobile() && variant === "menu") {
    if (!isUnifiedDriverRoute(location) || !isAndroidTwaApp()) return null;

    return (
      <Button
        type="button"
        variant="outline"
        className={cn("h-12 w-full justify-center font-medium", className)}
        onClick={() => {
          requestAndroidOverlayPermissionForDriver();
          onAfterAction?.();
        }}
      >
        Activar burbuja
      </Button>
    );
  }

  if (!bubble?.supported || !bubble.overlaySupported) return null;

  const { active, pinnedInSettings, setPinnedInSettings, isMinimized, overlaySupported, toggleMinimized } =
    bubble;

  const statusLine = pinnedInSettings
    ? "Mantienes la burbuja aunque no recibas servicios."
    : "Se activa sola al poner «Recibir servicios» (solo navegador de escritorio).";

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
      </div>
    );
  }

  return (
    <div className={cn("rounded-xl border border-border bg-card p-4 shadow-sm", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <PictureInPicture2 className="h-5 w-5 text-primary" aria-hidden />
            Burbuja flotante (escritorio)
          </h3>
          <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{statusLine}</p>
        </div>
        <Switch
          id="driver-bubble-mode-settings"
          checked={pinnedInSettings}
          onCheckedChange={setPinnedInSettings}
          aria-label="Mantener burbuja flotante siempre"
        />
      </div>
      {active && overlaySupported ? (
        <Button
          type="button"
          variant="outline"
          className="mt-4 w-full justify-start gap-2"
          onClick={() => void toggleMinimized()}
        >
          {isMinimized ? (
            <>
              <CircleDot className="h-4 w-4 shrink-0" aria-hidden />
              Expandir panel
            </>
          ) : (
            <>
              <Minimize2 className="h-4 w-4 shrink-0" aria-hidden />
              Minimizar a burbuja (esta pestaña)
            </>
          )}
        </Button>
      ) : null}
    </div>
  );
}
