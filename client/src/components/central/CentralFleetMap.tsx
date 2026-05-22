import { useEffect, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
  ZoomControl,
} from "react-leaflet";
import L from "leaflet";
import { Bookmark, Loader2, MapPinned, RefreshCw } from "lucide-react";
import type { CentralServiceMapView } from "@shared/dispatch-company";
import { getTaxiRasterLayerProps } from "@/components/taxi/leaflet-config";
import { createDriverVehicleIcon } from "@/components/driver/cargo-map-markers";
import { LeafletMapLayoutFix } from "@/components/taxi/LeafletMapLayoutFix";
import { GeoapifyMapAttribution } from "@/components/taxi/GeoapifyMapAttribution";
import { useDeferredLeafletMount } from "@/hooks/useDeferredLeafletMount";
import { useTheme } from "@/contexts/ThemeContext";
import type { CentralFleetDriver } from "@/hooks/use-central";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Convierte coordenadas GeoJSON LineString [lon, lat] → [lat, lon] para Leaflet. */
function lineStringLatLngs(geometry: unknown): [number, number][] {
  if (!geometry || typeof geometry !== "object") return [];
  const g = geometry as { type?: string; coordinates?: unknown };
  if (g.type !== "LineString" || !Array.isArray(g.coordinates)) return [];
  const out: [number, number][] = [];
  for (const pair of g.coordinates as unknown[]) {
    if (!Array.isArray(pair) || pair.length < 2) continue;
    const lon = Number(pair[0]);
    const lat = Number(pair[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    out.push([lat, lon]);
  }
  return out;
}

/**
 * Ajusta la cámara al conductor seguido en el mapa de flota.
 */
function CentralMapCamera({
  followDriver,
}: {
  followDriver: CentralFleetDriver | null;
}) {
  const map = useMap();
  const lastFollowUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!followDriver || followDriver.lat == null || followDriver.lon == null) {
      lastFollowUserIdRef.current = null;
      return;
    }

    const latlng: L.LatLngExpression = [followDriver.lat, followDriver.lon];
    if (lastFollowUserIdRef.current !== followDriver.userId) {
      lastFollowUserIdRef.current = followDriver.userId;
      const z = Math.max(14, map.getZoom());
      map.flyTo(latlng, z, { duration: 0.45 });
      return;
    }
    map.panTo(latlng, { animate: true });
  }, [followDriver, map]);

  return null;
}

function CentralMapToolbar({
  serviceCenter,
  serviceZoom,
  onPersistServiceMap,
  persistPending,
}: {
  serviceCenter: [number, number];
  serviceZoom: number;
  onPersistServiceMap?: (lat: number, lon: number, zoom: number) => void | Promise<void>;
  persistPending?: boolean;
}) {
  const map = useMap();
  return (
    <div className="pointer-events-none absolute bottom-3 right-3 z-[800] flex flex-col items-end gap-2">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="pointer-events-auto shadow-md backdrop-blur-sm"
        onClick={() => map.setView(serviceCenter, serviceZoom, { animate: true })}
      >
        <MapPinned className="mr-1.5 h-4 w-4 shrink-0" aria-hidden />
        Mi ciudad
      </Button>
      {onPersistServiceMap ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="pointer-events-auto border-border/80 bg-background/95 shadow-sm backdrop-blur-sm"
          disabled={persistPending}
          onClick={() => {
            const c = map.getCenter();
            const z = Math.round(map.getZoom());
            void onPersistServiceMap(c.lat, c.lng, z);
          }}
        >
          <Bookmark className="mr-1.5 h-4 w-4 shrink-0" aria-hidden />
          Guardar vista
        </Button>
      ) : null}
    </div>
  );
}

/** Tras refrescar datos, Leaflet a veces necesita recalcular tamaño (tiles/markers). */
function FleetMapInvalidateLayout({ nonce }: { nonce: number }) {
  const map = useMap();
  useEffect(() => {
    if (nonce === 0) return;
    const id = requestAnimationFrame(() => {
      try {
        if (!map.getContainer()?.isConnected) return;
        map.invalidateSize({ animate: false });
      } catch {
        /* mapa desmontado */
      }
    });
    return () => cancelAnimationFrame(id);
  }, [nonce, map]);
  return null;
}

type CentralFleetMapProps = {
  drivers: CentralFleetDriver[];
  onSelectDriver: (driver: CentralFleetDriver) => void;
  /** Centro de la ciudad de operación (no GPS del dispositivo). */
  serviceMapView: CentralServiceMapView;
  /** Mapa a pantalla completa dentro del contenedor flex (vista móvil). */
  fullscreen?: boolean;
  /** Botones Mi ciudad / Guardar vista del mapa. */
  showMapToolbar?: boolean;
  /** Persistir centro y zoom actuales del mapa como «ciudad» de la central. */
  onPersistServiceMap?: (lat: number, lon: number, zoom: number) => void | Promise<void>;
  persistServiceMapPending?: boolean;
  /** Remount al cambiar de empresa (admin). */
  mapInstanceKey?: string;
  /** Conductor seleccionado en el panel (datos en vivo); la cámara lo sigue en el mapa. */
  followDriver?: CentralFleetDriver | null;
  /** Vuelve a pedir la flota al servidor y actualiza marcadores. */
  onRefreshFleet?: () => void | Promise<unknown>;
  /** Indicador de carga mientras se refresca la flota. */
  fleetRefreshing?: boolean;
};

export function CentralFleetMap({
  drivers,
  onSelectDriver,
  serviceMapView,
  fullscreen = false,
  showMapToolbar = false,
  onPersistServiceMap,
  persistServiceMapPending = false,
  mapInstanceKey = "default",
  followDriver = null,
  onRefreshFleet,
  fleetRefreshing = false,
}: CentralFleetMapProps) {
  const { theme } = useTheme();
  const raster = getTaxiRasterLayerProps(theme === "dark");
  const { shellRef, ready } = useDeferredLeafletMount({ minShellHeightPx: fullscreen ? 64 : 64 });
  const [layoutNonce, setLayoutNonce] = useState(0);

  const handleRefreshFleet = () => {
    if (!onRefreshFleet) return;
    void (async () => {
      try {
        await onRefreshFleet();
      } finally {
        setLayoutNonce((n) => n + 1);
      }
    })();
  };

  const center: [number, number] = [serviceMapView.lat, serviceMapView.lon];
  const initialZoom = serviceMapView.cityZoom;

  return (
    <div
      ref={shellRef}
      className={
        fullscreen
          ? "relative h-full min-h-0 w-full flex-1 overflow-hidden"
          : "relative w-full overflow-hidden rounded-b-lg"
      }
      style={
        fullscreen
          ? { width: "100%", height: "100%", minHeight: 0 }
          : {
              width: "100%",
              minHeight: "min(58vh, 620px)",
              height: "min(58vh, 620px)",
            }
      }
    >
      {!ready ? (
        <div className="flex h-full w-full items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
        </div>
      ) : (
        <>
          {onRefreshFleet ? (
            <div
              className={cn(
                "pointer-events-none absolute z-[801]",
                fullscreen ? "left-3 top-[4.75rem]" : "right-3 top-3",
              )}
            >
              <Button
                type="button"
                size={fullscreen ? "icon" : "sm"}
                variant="secondary"
                className={cn(
                  "pointer-events-auto border-border/80 bg-background/95 shadow-md backdrop-blur-sm",
                  fullscreen ? "h-10 w-10 rounded-full" : "gap-1.5",
                )}
                disabled={fleetRefreshing}
                onClick={handleRefreshFleet}
                aria-label="Actualizar posiciones de conductores en el mapa"
                title="Actualizar mapa"
              >
                <RefreshCw className={cn("h-4 w-4 shrink-0", fleetRefreshing && "animate-spin")} aria-hidden />
                {!fullscreen ? <span className="hidden sm:inline">Actualizar mapa</span> : null}
                {!fullscreen ? (
                  <span className="sm:hidden">Actualizar</span>
                ) : null}
              </Button>
            </div>
          ) : null}
          <MapContainer
            key={mapInstanceKey}
            center={center}
            zoom={initialZoom}
            attributionControl={false}
            zoomControl={false}
            className="h-full w-full z-0"
            style={{ width: "100%", height: "100%", minHeight: fullscreen ? 200 : 280 }}
            scrollWheelZoom
          >
            <LeafletMapLayoutFix />
            <FleetMapInvalidateLayout nonce={layoutNonce} />
            {fullscreen ? <ZoomControl position="bottomleft" /> : <ZoomControl position="topleft" />}
            <TileLayer
              attribution={raster.attribution}
              url={raster.url}
              maxZoom={raster.maxZoom}
              {...(raster.subdomains != null ? { subdomains: raster.subdomains } : {})}
              {...(raster.apiKey ? { apiKey: raster.apiKey } : {})}
            />
            <CentralMapCamera followDriver={followDriver} />
            {drivers.map((d) => (
              <Marker
                key={d.userId}
                position={[d.lat!, d.lon!]}
                icon={createDriverVehicleIcon(d.vehicleType)}
                eventHandlers={{ click: () => onSelectDriver(d) }}
              >
                <Popup>
                  {d.name} {d.lastName}
                </Popup>
              </Marker>
            ))}
            {showMapToolbar ? (
              <CentralMapToolbar
                serviceCenter={center}
                serviceZoom={serviceMapView.cityZoom}
                onPersistServiceMap={onPersistServiceMap}
                persistPending={persistServiceMapPending}
              />
            ) : null}
          </MapContainer>
          <GeoapifyMapAttribution />
        </>
      )}
    </div>
  );
}
