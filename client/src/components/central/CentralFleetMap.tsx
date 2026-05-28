import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents, ZoomControl } from "react-leaflet";
import L from "leaflet";
import { Bookmark, Loader2, MapPinned, RefreshCw } from "lucide-react";
import type { CentralServiceMapView } from "@shared/dispatch-company";
import {
  getEffectiveLeafletMaxZoom,
  getLeafletMapContainerBehaviorProps,
  getLeafletTileLayerBehaviorProps,
  getTaxiRasterLayerProps,
} from "@/components/taxi/leaflet-config";
import { createDriverVehicleIcon } from "@/components/driver/cargo-map-markers";
import { LeafletMapLayoutFix } from "@/components/taxi/LeafletMapLayoutFix";
import { GeoapifyMapAttribution } from "@/components/taxi/GeoapifyMapAttribution";
import { useDeferredLeafletMount } from "@/hooks/useDeferredLeafletMount";
import { useTheme } from "@/contexts/ThemeContext";
import type { CentralFleetDriver } from "@/hooks/use-central";
import { formatCentralFleetMapHint } from "@/lib/central-fleet-position";
import { fleetMarkerSizeForZoom } from "@/lib/fleet-map-marker-size";
import { fleetWorkAccentForDriver, type FleetWorkAccent } from "@/lib/central-fleet-work-accent";
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
  focusNonce = 0,
}: {
  followDriver: CentralFleetDriver | null;
  focusNonce?: number;
}) {
  const map = useMap();
  const lastFocusRef = useRef<{ userId: string | null; nonce: number }>({ userId: null, nonce: -1 });

  useEffect(() => {
    if (!followDriver || followDriver.lat == null || followDriver.lon == null) {
      lastFocusRef.current = { userId: null, nonce: focusNonce };
      return;
    }

    if (
      lastFocusRef.current.userId === followDriver.userId &&
      lastFocusRef.current.nonce === focusNonce
    ) {
      return;
    }

    lastFocusRef.current = { userId: followDriver.userId, nonce: focusNonce };
    const latlng: L.LatLngExpression = [followDriver.lat, followDriver.lon];
    const z = Math.max(14, map.getZoom());
    map.flyTo(latlng, z, { duration: 0.45 });
  }, [followDriver, focusNonce, map]);

  return null;
}

function FleetMapZoomTracker({ onZoomChange }: { onZoomChange: (zoom: number) => void }) {
  const map = useMap();

  useMapEvents({
    zoomend: () => onZoomChange(map.getZoom()),
  });

  useEffect(() => {
    onZoomChange(map.getZoom());
  }, [map, onZoomChange]);

  return null;
}

function FleetVehicleMarkers({
  drivers,
  mapZoom,
  enteringDriverIds,
  onSelectDriver,
}: {
  drivers: CentralFleetDriver[];
  mapZoom: number;
  enteringDriverIds: Set<string>;
  onSelectDriver: (driver: CentralFleetDriver) => void;
}) {
  const markerSizePx = fleetMarkerSizeForZoom(mapZoom);

  return (
    <>
      {drivers.map((d) => {
        const stale = !d.positionLive || !!d.receivingStoppedAt;
        const mapHint = formatCentralFleetMapHint(d);
        const workAccent = fleetWorkAccentForDriver(d);
        const workLabel: Record<Exclude<FleetWorkAccent, null>, string> = {
          taxi: "Trabajando · taxi",
          delivery: "Trabajando · delivery",
          both: "Modo híbrido · taxi y delivery",
        };
        return (
          <Marker
            key={d.userId}
            position={[d.lat!, d.lon!]}
            icon={createDriverVehicleIcon(d.vehicleType, {
              entering: enteringDriverIds.has(d.userId),
              stale,
              sizePx: markerSizePx,
              workAccent: fleetWorkAccentForDriver(d),
            })}
            eventHandlers={{ click: () => onSelectDriver(d) }}
          >
            <Popup>
              <div className="text-sm">
                <p className="font-medium">
                  {d.name} {d.lastName}
                </p>
                {workAccent ? (
                  <p
                    className={cn(
                      "mt-1 text-xs font-medium",
                      workAccent === "taxi"
                        ? "text-sky-700 dark:text-sky-300"
                        : workAccent === "delivery"
                          ? "text-violet-700 dark:text-violet-300"
                          : "text-emerald-800 dark:text-emerald-200",
                    )}
                  >
                    {workLabel[workAccent]}
                  </p>
                ) : null}
                {mapHint ? <p className="mt-1 text-xs text-muted-foreground">{mapHint}</p> : null}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
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

/** Conductores que acaban de aparecer en el mapa (nuevo en flota o primera coordenada). */
function useFleetMarkerEntering(drivers: CentralFleetDriver[]): Set<string> {
  const prevOnMapRef = useRef(new Set<string>());
  const animatedRef = useRef(new Set<string>());

  const entering = useMemo(() => {
    const onMap = new Set<string>();
    const next = new Set<string>();
    for (const d of drivers) {
      if (d.lat == null || d.lon == null) continue;
      onMap.add(d.userId);
      if (!prevOnMapRef.current.has(d.userId) && !animatedRef.current.has(d.userId)) {
        next.add(d.userId);
      }
    }
    prevOnMapRef.current = onMap;
    for (const id of next) animatedRef.current.add(id);
    return next;
  }, [drivers]);

  useEffect(() => {
    const onMap = new Set(drivers.filter((d) => d.lat != null && d.lon != null).map((d) => d.userId));
    for (const id of animatedRef.current) {
      if (!onMap.has(id)) animatedRef.current.delete(id);
    }
  }, [drivers]);

  return entering;
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
  /** Incrementar al elegir conductor desde listado para recentrar el mapa. */
  focusNonce?: number;
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
  focusNonce = 0,
  onRefreshFleet,
  fleetRefreshing = false,
}: CentralFleetMapProps) {
  const { theme } = useTheme();
  const raster = getTaxiRasterLayerProps(theme === "dark");
  const tileBehavior = getLeafletTileLayerBehaviorProps();
  const mapBehavior = getLeafletMapContainerBehaviorProps();
  const tileMaxZoom = getEffectiveLeafletMaxZoom(raster.maxZoom);
  const { shellRef, ready } = useDeferredLeafletMount({ minShellHeightPx: fullscreen ? 64 : 64 });
  const center: [number, number] = [serviceMapView.lat, serviceMapView.lon];
  const initialZoom = serviceMapView.cityZoom;
  const [layoutNonce, setLayoutNonce] = useState(0);
  const [mapZoom, setMapZoom] = useState(initialZoom);
  const enteringDriverIds = useFleetMarkerEntering(drivers);

  useEffect(() => {
    setMapZoom(initialZoom);
  }, [initialZoom, mapInstanceKey]);

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
            maxZoom={tileMaxZoom}
            {...mapBehavior}
          >
            <LeafletMapLayoutFix />
            <FleetMapInvalidateLayout nonce={layoutNonce} />
            {fullscreen ? <ZoomControl position="bottomleft" /> : <ZoomControl position="topleft" />}
            <TileLayer
              attribution={raster.attribution}
              url={raster.url}
              maxZoom={tileMaxZoom}
              {...(raster.subdomains != null ? { subdomains: raster.subdomains } : {})}
              {...(raster.apiKey ? { apiKey: raster.apiKey } : {})}
              {...tileBehavior}
            />
            <FleetMapZoomTracker onZoomChange={setMapZoom} />
            <CentralMapCamera followDriver={followDriver} focusNonce={focusNonce} />
            <FleetVehicleMarkers
              drivers={drivers}
              mapZoom={mapZoom}
              enteringDriverIds={enteringDriverIds}
              onSelectDriver={onSelectDriver}
            />
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
