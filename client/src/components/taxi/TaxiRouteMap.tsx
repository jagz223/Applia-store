import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  GeoJSON,
  ZoomControl,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type { GeoJsonObject } from "geojson";
import L from "leaflet";
import { Loader2, Navigation } from "lucide-react";
import {
  getEffectiveLeafletMaxZoom,
  getLeafletMapContainerBehaviorProps,
  getLeafletRotateMapOptions,
  getLeafletTileLayerBehaviorProps,
  getTaxiRasterLayerProps,
} from "@/components/taxi/leaflet-config";
import "@/components/taxi/leaflet-config";
import { useTheme } from "@/contexts/ThemeContext";
import { LeafletMapLayoutFix } from "@/components/taxi/LeafletMapLayoutFix";
import { GeoapifyMapAttribution } from "@/components/taxi/GeoapifyMapAttribution";
import { useDeferredLeafletMount } from "@/hooks/useDeferredLeafletMount";
import { cn } from "@/lib/utils";
import { mapBoundsFitKey, mapPointFitKey } from "@/lib/leaflet-map-camera";
import { isLeafletMapContainerLive, safeInvalidateSize } from "@/lib/safe-leaflet";
import { Button } from "@/components/ui/button";
import { LeafletMapMotionEnhancer } from "@/components/taxi/LeafletMapMotionEnhancer";
import { MapRotateControls } from "@/components/taxi/MapPerspectiveControls";
import { VehicleMapMarker } from "@/components/taxi/VehicleMapMarker";

export type MapPoint = { lat: number; lon: number; label?: string };

/** Marcador de conductor / vehículo en ruta (icono según tipo). */
export type TaxiRouteVehicleMarker = {
  id: string;
  lat: number;
  lon: number;
  kind?: "vehicle" | "driver";
  /** Código de vehículo (`motorcycle`, `car`, …); si falta se usa `markerVehicleTypeFallback`. */
  vehicleType?: string | null;
  /** Rumbo en servicio activo (0 = norte). */
  headingDeg?: number | null;
  rotateWithHeading?: boolean;
};

const NO_NEARBY_VEHICLES: readonly TaxiRouteVehicleMarker[] = [];

function MapClickLayer({ onPick }: { onPick: (lat: number, lon: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function FitRouteBounds({ start, end }: { start: MapPoint; end: MapPoint }) {
  const map = useMap();
  const lastFitKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const key = mapBoundsFitKey(start, end);
    if (lastFitKeyRef.current === key) return;
    lastFitKeyRef.current = key;
    let cancelled = false;
    try {
      if (!isLeafletMapContainerLive(map)) return;
      const bounds = L.latLngBounds(L.latLng(start.lat, start.lon), L.latLng(end.lat, end.lon));
      map.fitBounds(bounds, { padding: [52, 52], maxZoom: 15 });
      const raf = requestAnimationFrame(() => {
        if (!cancelled) safeInvalidateSize(map);
      });
      return () => {
        cancelled = true;
        cancelAnimationFrame(raf);
      };
    } catch {
      /* mapa desmontándose */
    }
  }, [map, start.lat, start.lon, end.lat, end.lon]);
  return null;
}

function FocusSinglePoint({ point }: { point: MapPoint | null }) {
  const map = useMap();
  const lastKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!point) return;
    const z = Math.max(map.getZoom(), 14);
    const key = mapPointFitKey(point, z);
    if (lastKeyRef.current === key) return;
    lastKeyRef.current = key;
    let cancelled = false;
    try {
      if (!isLeafletMapContainerLive(map)) return;
      const ll = L.latLng(point.lat, point.lon);
      map.setView(ll, z, { animate: true });
      const raf = requestAnimationFrame(() => {
        if (!cancelled) safeInvalidateSize(map);
      });
      return () => {
        cancelled = true;
        cancelAnimationFrame(raf);
      };
    } catch {
      /* mapa desmontándose */
    }
  }, [map, point?.lat, point?.lon]);
  return null;
}

/** Centra el mapa cuando cambian defaultCenter/defaultZoom (p. ej. GPS inicial). */
function SyncBootstrapView({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  const lastKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const key = mapPointFitKey({ lat: center[0], lon: center[1] }, zoom);
    if (lastKeyRef.current === key) return;
    lastKeyRef.current = key;
    let cancelled = false;
    try {
      if (!isLeafletMapContainerLive(map)) return;
      map.setView(L.latLng(center[0], center[1]), zoom, { animate: true });
      const raf = requestAnimationFrame(() => {
        if (!cancelled) safeInvalidateSize(map);
      });
      return () => {
        cancelled = true;
        cancelAnimationFrame(raf);
      };
    } catch {
      /* mapa desmontándose */
    }
  }, [map, center[0], center[1], zoom]);
  return null;
}

function RecenterControl({
  onClick,
  zoomPosition,
  ariaLabel = "Usar mi ubicación en el punto seleccionado",
}: {
  onClick: () => void;
  zoomPosition: TaxiRouteMapProps["zoomPosition"];
  ariaLabel?: string;
}) {
  const map = useMap();
  const [host, setHost] = useState<HTMLDivElement | null>(null);

  const selector = (() => {
    switch (zoomPosition) {
      case "topright":
        return ".leaflet-top.leaflet-right";
      case "bottomleft":
        return ".leaflet-bottom.leaflet-left";
      case "bottomright":
        return ".leaflet-bottom.leaflet-right";
      default:
        return ".leaflet-top.leaflet-left";
    }
  })();

  useLayoutEffect(() => {
    const root = map.getContainer();
    const col = root.querySelector(selector) as HTMLDivElement | null;
    if (!col) return;

    const el = document.createElement("div");
    el.setAttribute("data-genfeb", "taxi-recenter");
    el.className = "leaflet-control";
    // Importante: evita que el click se propague al mapa (y dispare onMapPick / arrastre).
    L.DomEvent.disableClickPropagation(el);
    L.DomEvent.disableScrollPropagation(el);

    let raf = 0;
    let frame = 0;
    const maxFrames = 10;
    let done = false;

    const tryPlace = () => {
      if (done) return;
      if (!isLeafletMapContainerLive(map) || !col.isConnected) return;
      const zoom = col.querySelector(".leaflet-control-zoom, .leaflet-bar") as HTMLElement | null;
      if (zoom) {
        zoom.after(el);
        setHost(el);
        done = true;
        return;
      }
      frame += 1;
      if (frame < maxFrames) raf = requestAnimationFrame(tryPlace);
      else {
        col.appendChild(el);
        setHost(el);
        done = true;
      }
    };

    raf = requestAnimationFrame(tryPlace);

    return () => {
      done = true;
      cancelAnimationFrame(raf);
      el.remove();
      setHost(null);
    };
  }, [map, selector]);

  if (!host) return null;

  return createPortal(
    <div
      className="!mt-3 w-full border-t border-foreground/20 pt-3"
      onMouseDown={(e) => {
        e.stopPropagation();
      }}
      onClick={(e) => {
        e.stopPropagation();
      }}
      onTouchStart={(e) => {
        e.stopPropagation();
      }}
    >
      <Button
        type="button"
        size="icon"
        variant="secondary"
        className={cn(
          "h-12 w-12 rounded-full border-2 border-foreground/30 bg-background text-foreground",
          "shadow-md ring-2 ring-foreground/10 hover:bg-muted hover:ring-foreground/25"
        )}
        aria-label={ariaLabel}
        title={ariaLabel}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
          requestAnimationFrame(() => safeInvalidateSize(map));
        }}
      >
        <Navigation className="h-5 w-5 text-foreground" strokeWidth={2.5} />
      </Button>
    </div>,
    host
  );
}

export interface TaxiRouteMapProps {
  defaultCenter: [number, number];
  defaultZoom: number;
  start: MapPoint | null;
  end: MapPoint | null;
  /**
   * Si se define, `FitRouteBounds` usa estos puntos (p. ej. conductor→destino en viaje en curso)
   * en lugar de `start`+`end`, para alinear la cámara con la vista del driver.
   */
  routeFocus?: { start: MapPoint; end: MapPoint } | null;
  /** Remount de GeoJSON al cambiar de tramo (p. ej. matched → en curso). */
  routeGeometryKey?: number;
  routeGeometry: GeoJsonObject | null;
  /** Centra la vista en este punto (p. ej. pestaña origen/destino activa o tras GPS). */
  focusPoint?: MapPoint | null;
  onMapPick: (lat: number, lon: number) => void;
  nearbyDemoVehicles?: ReadonlyArray<TaxiRouteVehicleMarker>;
  /** Marcadores extra (p. ej. ubicación del conductor). */
  extraMarkers?: ReadonlyArray<TaxiRouteVehicleMarker>;
  /** Si un marcador no trae `vehicleType`, se usa este valor (p. ej. tipo elegido por el pasajero en búsqueda). */
  markerVehicleTypeFallback?: string | null;
  suppressMapPick?: boolean;
  wrapperClassName?: string;
  /** Contenedor padre con altura definida (p. ej. pantalla completa). */
  fullscreen?: boolean;
  /** Si true, al cambiar defaultCenter/defaultZoom se aplica al mapa (GPS tras carga). */
  syncDefaultView?: boolean;
  /**
   * Posición del +/- de Leaflet. En Car Go móvil conviene `bottomleft` para no taparse con la cabecera ni tarjetas superiores.
   */
  zoomPosition?: "default" | "topright" | "bottomleft" | "bottomright";
  /** Botón flotante tipo “recenter” como drivers (ej. usar GPS para origen). */
  onRecenter?: (() => void) | null;
  recenterAriaLabel?: string;
}

export function TaxiRouteMap({
  defaultCenter,
  defaultZoom,
  start,
  end,
  routeFocus = null,
  routeGeometryKey = 0,
  routeGeometry,
  focusPoint = null,
  onMapPick,
  nearbyDemoVehicles = NO_NEARBY_VEHICLES,
  extraMarkers,
  markerVehicleTypeFallback = null,
  suppressMapPick = false,
  wrapperClassName,
  fullscreen = false,
  syncDefaultView = false,
  zoomPosition = "default",
  onRecenter = null,
  recenterAriaLabel,
}: TaxiRouteMapProps) {
  const { theme } = useTheme();
  const raster = getTaxiRasterLayerProps(theme === "dark");
  const tileBehavior = getLeafletTileLayerBehaviorProps();
  const mapBehavior = getLeafletMapContainerBehaviorProps();
  const tileMaxZoom = getEffectiveLeafletMaxZoom(raster.maxZoom);
  const rotateOptions = getLeafletRotateMapOptions();
  const cameraFocus =
    focusPoint ?? (start && !end ? start : !start && end ? end : null);
  const pickHandler = suppressMapPick ? () => {} : onMapPick;
  const customZoom = zoomPosition !== "default";
  const { shellRef, ready } = useDeferredLeafletMount({ minShellHeightPx: fullscreen ? 120 : 64 });
  const [bearingDeg, setBearingDeg] = useState(0);
  const markers =
    extraMarkers ??
    nearbyDemoVehicles.map((v) => ({
      id: v.id,
      lat: v.lat,
      lon: v.lon,
      kind: "vehicle" as const,
      vehicleType: v.vehicleType,
    }));

  const resolveMarkerVehicleType = (v: TaxiRouteVehicleMarker) =>
    v.vehicleType ?? markerVehicleTypeFallback ?? undefined;

  const fitStart = routeFocus?.start ?? start;
  const fitEnd = routeFocus?.end ?? end;

  const shellStyle = fullscreen
    ? ({ width: "100%", height: "100%", minHeight: 0, maxHeight: "none" } as const)
    : ({
        width: "100%",
        minHeight: 420,
        height: "52vh",
        maxHeight: 640,
      } as const);

  return (
    <div
      ref={shellRef}
      className={cn("taxi-leaflet-wrapper", fullscreen && "genfeb-taxi-route-fs", wrapperClassName)}
      style={shellStyle}
    >
      {!ready ? (
        <div
          className={
            fullscreen
              ? "flex h-full min-h-[120px] w-full flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-muted/30 text-sm text-muted-foreground"
              : "flex h-full min-h-[420px] w-full items-center justify-center gap-2 rounded-xl border border-border bg-muted/30 text-sm text-muted-foreground"
          }
        >
          <Loader2 className="h-5 w-5 animate-spin shrink-0" aria-hidden />
          Preparando mapa…
        </div>
      ) : (
        <div className={fullscreen ? "relative h-full min-h-0 flex-1" : "relative h-full min-h-[400px]"}>
          <div className="h-full w-full overflow-hidden rounded-xl">
            <MapContainer
              center={defaultCenter}
              zoom={defaultZoom}
              attributionControl={false}
              zoomControl={!customZoom}
              className="h-full w-full rounded-xl border border-border z-0"
              style={{ width: "100%", height: "100%", minHeight: fullscreen ? 0 : 400 }}
              scrollWheelZoom
              maxZoom={tileMaxZoom}
              {...mapBehavior}
              {...rotateOptions}
            >
              {zoomPosition === "topright" ? <ZoomControl position="topright" /> : null}
              {zoomPosition === "bottomleft" ? <ZoomControl position="bottomleft" /> : null}
              {zoomPosition === "bottomright" ? <ZoomControl position="bottomright" /> : null}
              <LeafletMapMotionEnhancer bearingDeg={bearingDeg} onBearingChange={setBearingDeg} />
              <TileLayer
                key={`tiles-${theme}`}
                attribution={raster.attribution}
                url={raster.url}
                maxZoom={tileMaxZoom}
                {...(raster.subdomains != null ? { subdomains: raster.subdomains } : {})}
                {...(raster.apiKey ? { apiKey: raster.apiKey } : {})}
                {...tileBehavior}
              />
              <LeafletMapLayoutFix />
              {syncDefaultView ? <SyncBootstrapView center={defaultCenter} zoom={defaultZoom} /> : null}
              <MapClickLayer onPick={pickHandler} />
              {onRecenter ? (
                <RecenterControl
                  onClick={onRecenter}
                  zoomPosition={zoomPosition}
                  ariaLabel={recenterAriaLabel}
                />
              ) : null}
              {fitStart && fitEnd && !routeFocus && !focusPoint ? (
                <FitRouteBounds start={fitStart} end={fitEnd} />
              ) : null}
              {cameraFocus && <FocusSinglePoint point={cameraFocus} />}
              {start && (
                <CircleMarker
                  center={[start.lat, start.lon]}
                  radius={10}
                  pathOptions={{ color: "#15803d", fillColor: "#22c55e", fillOpacity: 0.85, weight: 2 }}
                />
              )}
              {end && (
                <CircleMarker
                  center={[end.lat, end.lon]}
                  radius={10}
                  pathOptions={{ color: "#b91c1c", fillColor: "#ef4444", fillOpacity: 0.85, weight: 2 }}
                />
              )}
              {routeGeometry && (
                <GeoJSON
                  key={routeGeometryKey}
                  data={routeGeometry}
                  style={{
                    color: "#2563eb",
                    weight: 5,
                    opacity: 0.88,
                  }}
                />
              )}
              {markers.map((v) => (
                <VehicleMapMarker
                  key={v.id}
                  position={[v.lat, v.lon]}
                  vehicleType={resolveMarkerVehicleType(v)}
                  headingDeg={v.headingDeg}
                  rotateWithHeading={v.rotateWithHeading ?? v.headingDeg != null}
                  interactive={false}
                  zIndexOffset={v.kind === "driver" ? 620 : 600}
                />
              ))}
            </MapContainer>
          </div>
          <GeoapifyMapAttribution />
          <MapRotateControls bearingDeg={bearingDeg} onBearingChange={setBearingDeg} />
        </div>
      )}
    </div>
  );
}
