import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
import { fleetMapMarkerColorForUser } from "@/lib/fleet-map-marker-color";
import { spreadFleetMapMarkerPositions } from "@/lib/fleet-map-marker-spread";
import { fleetWorkAccentForDriver, centralDriverReceivingModeLabel, type FleetWorkAccent } from "@/lib/central-fleet-work-accent";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { CENTRAL_MOBILE_MAP_TOOLBAR_SLOT_ID } from "@/lib/central-viewport-layout";

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

function FleetMapDriverPopup({
  driver,
  mapHint,
  receivingLabel,
  workAccent,
}: {
  driver: CentralFleetDriver;
  mapHint: string | null;
  receivingLabel: string | null;
  workAccent: FleetWorkAccent;
}) {
  const markerColor = fleetMapMarkerColorForUser(driver.userId);
  return (
    <div className="flex max-w-[220px] items-start gap-2.5 text-sm">
      <Avatar
        className="h-9 w-9 shrink-0 ring-2 ring-background"
        style={{ boxShadow: `0 0 0 2px ${markerColor}` }}
      >
        <AvatarImage src={driver.avatar ?? undefined} alt="" />
        <AvatarFallback className="bg-primary/10 text-[10px] text-primary">
          {driver.name[0]}
          {driver.lastName[0]}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium leading-tight">
          {driver.name} {driver.lastName}
        </p>
        {receivingLabel ? (
          <p
            className={cn(
              "mt-0.5 text-xs font-medium leading-snug",
              workAccent === "taxi"
                ? "text-sky-700 dark:text-sky-300"
                : workAccent === "delivery"
                  ? "text-violet-700 dark:text-violet-300"
                  : "text-emerald-800 dark:text-emerald-200",
            )}
          >
            {receivingLabel}
          </p>
        ) : driver.inService ? (
          <p className="mt-0.5 text-xs font-medium text-primary">En servicio</p>
        ) : (
          <p className="mt-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">Activo</p>
        )}
        {mapHint ? <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{mapHint}</p> : null}
      </div>
    </div>
  );
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

  const displayPositions = useMemo(() => {
    const points = drivers
      .filter((d) => d.lat != null && d.lon != null)
      .map((d) => ({ userId: d.userId, lat: d.lat!, lon: d.lon! }));
    return spreadFleetMapMarkerPositions(points, mapZoom);
  }, [drivers, mapZoom]);

  return (
    <>
      {drivers.map((d) => {
        const stale = !d.positionLive || !!d.receivingStoppedAt;
        const mapHint = formatCentralFleetMapHint(d);
        const workAccent = fleetWorkAccentForDriver(d);
        const receivingLabel = centralDriverReceivingModeLabel(d);
        const display = displayPositions.get(d.userId);
        const position: [number, number] =
          display != null ? [display.lat, display.lon] : [d.lat!, d.lon!];
        const markerColor = fleetMapMarkerColorForUser(d.userId);
        return (
          <Marker
            key={d.userId}
            position={position}
            icon={createDriverVehicleIcon(d.vehicleType, {
              entering: enteringDriverIds.has(d.userId),
              stale,
              sizePx: markerSizePx,
              workAccent,
              markerColor,
            })}
            eventHandlers={{ click: () => onSelectDriver(d) }}
          >
            <Popup minWidth={180} maxWidth={240}>
              <FleetMapDriverPopup
                driver={d}
                mapHint={mapHint}
                receivingLabel={receivingLabel}
                workAccent={workAccent}
              />
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
  mobileCompact = false,
}: {
  serviceCenter: [number, number];
  serviceZoom: number;
  onPersistServiceMap?: (lat: number, lon: number, zoom: number) => void | Promise<void>;
  persistPending?: boolean;
  /** Botones compactos en overlay superior (móvil). */
  mobileCompact?: boolean;
}) {
  const map = useMap();
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!mobileCompact) {
      setPortalTarget(null);
      return;
    }
    setPortalTarget(document.getElementById(CENTRAL_MOBILE_MAP_TOOLBAR_SLOT_ID));
  }, [mobileCompact]);

  const controls = (
    <>
      <Button
        type="button"
        size={mobileCompact ? "icon" : "sm"}
        variant="secondary"
        className={cn(
          "pointer-events-auto border-border/80 bg-background/95 shadow-md backdrop-blur-sm",
          mobileCompact ? "h-9 w-9 rounded-full" : "shadow-md backdrop-blur-sm",
        )}
        onClick={() => map.setView(serviceCenter, serviceZoom, { animate: true })}
        aria-label="Centrar mapa en mi ciudad"
        title="Mi ciudad"
      >
        <MapPinned className={cn("h-4 w-4 shrink-0", !mobileCompact && "mr-1.5")} aria-hidden />
        {!mobileCompact ? "Mi ciudad" : null}
      </Button>
      {onPersistServiceMap ? (
        <Button
          type="button"
          size={mobileCompact ? "icon" : "sm"}
          variant="outline"
          className={cn(
            "pointer-events-auto border-border/80 bg-background/95 shadow-sm backdrop-blur-sm",
            mobileCompact && "h-9 w-9 rounded-full",
          )}
          disabled={persistPending}
          onClick={() => {
            const c = map.getCenter();
            const z = Math.round(map.getZoom());
            void onPersistServiceMap(c.lat, c.lng, z);
          }}
          aria-label="Guardar vista del mapa"
          title="Guardar vista"
        >
          <Bookmark className={cn("h-4 w-4 shrink-0", !mobileCompact && "mr-1.5")} aria-hidden />
          {!mobileCompact ? "Guardar vista" : null}
        </Button>
      ) : null}
    </>
  );

  if (mobileCompact && portalTarget) {
    return createPortal(
      <div className="pointer-events-auto flex items-center justify-end gap-1.5">{controls}</div>,
      portalTarget,
    );
  }

  if (mobileCompact) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute bottom-3 right-3 z-[800] flex flex-col items-end gap-2">
      {controls}
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
  /** Ocultar botón flotante de refresco (p. ej. si va en la cabecera móvil). */
  hideRefreshControl?: boolean;
  /** Ocultar atribución (p. ej. la coloca el layout móvil sobre la barra inferior). */
  hideAttribution?: boolean;
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
  hideRefreshControl = false,
  hideAttribution = false,
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
          ? "central-fleet-map-fs relative h-full min-h-0 w-full flex-1 overflow-hidden"
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
          {onRefreshFleet && !hideRefreshControl ? (
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
                mobileCompact={fullscreen}
              />
            ) : null}
          </MapContainer>
          {!hideAttribution ? <GeoapifyMapAttribution /> : null}
        </>
      )}
    </div>
  );
}
