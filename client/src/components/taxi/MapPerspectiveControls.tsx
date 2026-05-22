import { useCallback, useEffect, useState } from "react";
import { useMap } from "react-leaflet";
import { Button } from "@/components/ui/button";
import { RotateCcw, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { safeInvalidateSize } from "@/lib/safe-leaflet";

const TILT_STEP = 4;
const TILT_MAX = 22;
const BEARING_STEP = 15;

/**
 * Panel flotante (inclinar / girar / restablecer). Desactivado hasta afinar la interacción.
 * Poner en `true` para volver a mostrarlo en cliente y conductor.
 */
export const MAP_PERSPECTIVE_CONTROLS_VISIBLE = false;

/** Aplica rotación al plano del mapa (Leaflet). Mejor con ángulos moderados. */
export function MapPaneBearing({ degrees }: { degrees: number }) {
  const map = useMap();
  useEffect(() => {
    let pane: HTMLElement | undefined;
    try {
      pane = map.getPane("mapPane") as HTMLElement | undefined;
    } catch {
      return;
    }
    if (!pane) return;

    const prev = pane.style.transform;
    const prevOrigin = pane.style.transformOrigin;
    pane.style.transformOrigin = "50% 50%";
    pane.style.transform = degrees === 0 ? "" : `rotate(${degrees}deg)`;

    // Cuando el usuario “abusa” navegando, el mapa puede desmontarse en medio del frame.
    // Guardamos para no tocar internals de Leaflet si el container ya no existe.
    const raf = requestAnimationFrame(() => safeInvalidateSize(map));
    return () => {
      cancelAnimationFrame(raf);
      try {
        if (!pane) return;
        if (!pane.isConnected) return;
        pane.style.transform = prev;
        pane.style.transformOrigin = prevOrigin;
      } catch {
        /* pane ya no existe */
      }
    };
  }, [map, degrees]);
  return null;
}

type MapPerspectiveControlsProps = {
  /** Inclinación visual (rotateX) en grados, 0 = plano. */
  tiltDeg: number;
  onTiltChange: (n: number) => void;
  /** Rotación del plano del mapa (yaw), grados. */
  bearingDeg: number;
  onBearingChange: (n: number) => void;
  className?: string;
};

/**
 * Controles flotantes: inclinación del lienzo (perspectiva) y giro del mapa.
 * La inclinación se aplica al envoltorio exterior; el giro al pane interno de Leaflet.
 */
export function MapPerspectiveControls({
  tiltDeg,
  onTiltChange,
  bearingDeg,
  onBearingChange,
  className,
}: MapPerspectiveControlsProps) {
  const normalizeBearing = useCallback((d: number) => ((d % 360) + 360) % 360, []);

  return (
    <div
      className={cn(
        "pointer-events-none absolute bottom-3 left-3 z-[500] flex max-w-[min(100%-1.5rem,220px)] flex-col gap-1.5 rounded-2xl border border-border/80 bg-background/92 p-2 shadow-md backdrop-blur-sm",
        className
      )}
    >
      <p className="pointer-events-none px-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Vista del mapa
      </p>
      <div className="pointer-events-auto flex flex-wrap items-center gap-1">
        <span className="text-[10px] text-muted-foreground w-full">Inclinar</span>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-8 min-w-[2.25rem] px-2 text-xs"
          aria-label="Menos inclinación"
          onClick={() => onTiltChange(Math.max(0, tiltDeg - TILT_STEP))}
        >
          −
        </Button>
        <span className="min-w-[2.5rem] text-center text-[11px] tabular-nums text-foreground">{tiltDeg}°</span>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-8 min-w-[2.25rem] px-2 text-xs"
          aria-label="Más inclinación"
          onClick={() => onTiltChange(Math.min(TILT_MAX, tiltDeg + TILT_STEP))}
        >
          +
        </Button>
      </div>
      <div className="pointer-events-auto flex flex-wrap items-center gap-1 border-t border-border/60 pt-1.5">
        <span className="text-[10px] text-muted-foreground w-full">Girar</span>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="h-8 w-8 shrink-0"
          aria-label="Girar mapa a la izquierda"
          onClick={() => onBearingChange(normalizeBearing(bearingDeg - BEARING_STEP))}
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
        <span className="min-w-[2.25rem] flex-1 text-center text-[11px] tabular-nums text-foreground">{bearingDeg}°</span>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="h-8 w-8 shrink-0"
          aria-label="Girar mapa a la derecha"
          onClick={() => onBearingChange(normalizeBearing(bearingDeg + BEARING_STEP))}
        >
          <RotateCw className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 w-full text-[11px]"
          onClick={() => {
            onTiltChange(0);
            onBearingChange(0);
          }}
        >
          Restablecer
        </Button>
      </div>
    </div>
  );
}

/** Hook local opcional para mapas que no reciben estado externo. */
export function useMapPerspectiveState() {
  const [tiltDeg, setTiltDeg] = useState(0);
  const [bearingDeg, setBearingDeg] = useState(0);
  return { tiltDeg, setTiltDeg, bearingDeg, setBearingDeg };
}
