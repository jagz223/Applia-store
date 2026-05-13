import { cn } from "@/lib/utils";
import { showGeoapifyMapAttribution } from "@/components/taxi/leaflet-config";

/**
 * Atribución legal de las **teselas** del mapa (Geoapify + OpenMapTiles + OSM).
 * El routing/geocoding también usa Geoapify en servidor, pero esta franja solo cubre la capa visual del mapa.
 */
export function GeoapifyMapAttribution({ className }: { className?: string }) {
  if (!showGeoapifyMapAttribution()) return null;
  return (
    <div
      className={cn(
        "pointer-events-none absolute bottom-1 right-1 z-[650] max-w-[min(calc(100%-0.5rem),15rem)] select-none",
        className
      )}
      role="note"
    >
      <p className="pointer-events-auto rounded border border-border/60 bg-background/80 px-1.5 py-0.5 text-[9px] leading-tight text-muted-foreground shadow-sm backdrop-blur-[2px] sm:text-[10px]">
        <a
          href="https://www.geoapify.com/"
          target="_blank"
          rel="noreferrer"
          className="text-muted-foreground underline decoration-muted-foreground/40 underline-offset-2 hover:text-foreground"
        >
          Powered by Geoapify
        </a>
        <span className="text-muted-foreground/70"> · </span>
        <a
          href="https://openmaptiles.org/"
          target="_blank"
          rel="noreferrer"
          className="text-muted-foreground underline decoration-muted-foreground/40 underline-offset-2 hover:text-foreground"
        >
          © OpenMapTiles
        </a>
        <span className="text-muted-foreground/70"> · </span>
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
          className="text-muted-foreground underline decoration-muted-foreground/40 underline-offset-2 hover:text-foreground"
        >
          © OSM
        </a>
      </p>
    </div>
  );
}
