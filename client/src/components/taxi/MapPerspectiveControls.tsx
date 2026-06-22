import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { RotateCcw, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { isLeafletDesktopMap } from "@/components/taxi/leaflet-config";
import { normalizeMapBearing } from "@/lib/leaflet-map-rotate";

const BEARING_STEP = 12;

type MapRotateControlsProps = {
  bearingDeg: number;
  onBearingChange: (n: number) => void;
  className?: string;
};

/** Botones de giro del mapa — solo escritorio (móvil usa dos dedos). */
export function MapRotateControls({ bearingDeg, onBearingChange, className }: MapRotateControlsProps) {
  const normalizeBearing = useCallback((d: number) => normalizeMapBearing(d), []);

  if (!isLeafletDesktopMap()) return null;

  const bearing = normalizeBearing(bearingDeg);
  const nearNorth = bearing < 0.5 || bearing > 359.5;

  return (
    <div
      className={cn(
        "pointer-events-none absolute bottom-10 right-3 z-[500] flex max-w-[min(100%-1.5rem,168px)] flex-col gap-1.5 rounded-2xl border border-border/80 bg-background/92 p-2 shadow-md backdrop-blur-sm",
        className,
      )}
    >
      <p className="pointer-events-none px-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Girar mapa
      </p>
      <div className="pointer-events-auto flex flex-col gap-1">
        <div className="flex items-center justify-center gap-1">
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
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 w-full text-[11px]"
          disabled={nearNorth}
          onClick={() => onBearingChange(0)}
        >
          Restablecer norte
        </Button>
      </div>
    </div>
  );
}
