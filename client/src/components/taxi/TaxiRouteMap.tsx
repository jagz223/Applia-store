import { useEffect, useState } from "react";
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
import { Loader2 } from "lucide-react";
import {
  TAXI_TILE_ATTRIBUTION,
  TAXI_TILE_LAYER_URL,
  TAXI_TILE_MAX_ZOOM,
  TAXI_TILE_SUBDOMAINS,
} from "@/components/taxi/leaflet-config";
import { LeafletMapLayoutFix } from "@/components/taxi/LeafletMapLayoutFix";
import { useDeferredLeafletMount } from "@/hooks/useDeferredLeafletMount";
import { cn } from "@/lib/utils";
import {
  MAP_PERSPECTIVE_CONTROLS_VISIBLE,
  MapPaneBearing,
  MapPerspectiveControls,
} from "@/components/taxi/MapPerspectiveControls";

export type MapPoint = { lat: number; lon: number };

const NO_NEARBY_VEHICLES: readonly { id: string; lat: number; lon: number }[] = [];

function MapClickLayer({ onPick }: { onPick: (lat: number, lon: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function FitRouteBounds({
  start,
  end,
  extra,
}: {
  start: MapPoint | null;
  end: MapPoint | null;
  extra: ReadonlyArray<{ lat: number; lon: number }>;
}) {
  const map = useMap();
  useEffect(() => {
    if (!start || !end) return;
    try {
      const c = map.getContainer();
      if (!c?.isConnected) return;
      const bounds = L.latLngBounds(L.latLng(start.lat, start.lon), L.latLng(end.lat, end.lon));
      for (const p of extra) bounds.extend(L.latLng(p.lat, p.lon));
      map.fitBounds(bounds, { padding: [52, 52], maxZoom: 15 });
      requestAnimationFrame(() => {
        try {
          const cc = map.getContainer();
          if (!cc?.isConnected) return;
          map.invalidateSize({ animate: false });
        } catch {
          /* mapa desmontándose */
        }
      });
    } catch {
      /* mapa desmontándose (Leaflet panes/_leaflet_pos aún no listos) */
    }
  }, [map, start?.lat, start?.lon, end?.lat, end?.lon, extra]);
  return null;
}

function FocusSinglePoint({ point }: { point: MapPoint | null }) {
  const map = useMap();
  useEffect(() => {
    if (!point) return;
    const ll = L.latLng(point.lat, point.lon);
    const z = Math.max(map.getZoom(), 14);
    map.setView(ll, z, { animate: true });
    requestAnimationFrame(() => map.invalidateSize({ animate: false }));
  }, [map, point?.lat, point?.lon]);
  return null;
}

/** Centra el mapa cuando cambian defaultCenter/defaultZoom (p. ej. GPS inicial). */
function SyncBootstrapView({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    try {
      map.setView(L.latLng(center[0], center[1]), zoom, { animate: true });
      requestAnimationFrame(() => map.invalidateSize({ animate: false }));
    } catch {
      /* mapa desmontándose */
    }
  }, [map, center[0], center[1], zoom]);
  return null;
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
  onMapPick: (lat: number, lon: number) => void;
  nearbyDemoVehicles?: ReadonlyArray<{ id: string; lat: number; lon: number }>;
  /** Marcadores extra (p. ej. ubicación del conductor). */
  extraMarkers?: ReadonlyArray<{ id: string; lat: number; lon: number; kind?: "vehicle" | "driver" }>;
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
}

export function TaxiRouteMap({
  defaultCenter,
  defaultZoom,
  start,
  end,
  routeFocus = null,
  routeGeometryKey = 0,
  routeGeometry,
  onMapPick,
  nearbyDemoVehicles = NO_NEARBY_VEHICLES,
  extraMarkers,
  suppressMapPick = false,
  wrapperClassName,
  fullscreen = false,
  syncDefaultView = false,
  zoomPosition = "default",
}: TaxiRouteMapProps) {
  const singleFocus = start && !end ? start : !start && end ? end : null;
  const pickHandler = suppressMapPick ? () => {} : onMapPick;
  const customZoom = zoomPosition !== "default";
  const { shellRef, ready } = useDeferredLeafletMount({ minShellHeightPx: fullscreen ? 120 : 64 });
  const [tiltDeg, setTiltDeg] = useState(0);
  const [bearingDeg, setBearingDeg] = useState(0);
  const markers =
    extraMarkers ??
    nearbyDemoVehicles.map((v) => ({
      id: v.id,
      lat: v.lat,
      lon: v.lon,
      kind: "vehicle" as const,
    }));

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
        <div
          className={
            fullscreen
              ? "relative h-full min-h-0 flex-1 [perspective:960px]"
              : "relative h-full min-h-[400px] [perspective:960px]"
          }
        >
          <div
            className="h-full w-full overflow-hidden rounded-xl transition-transform duration-300 ease-out"
            style={{ transform: `rotateX(${tiltDeg}deg)` }}
          >
            <MapContainer
              center={defaultCenter}
              zoom={defaultZoom}
              attributionControl={false}
              zoomControl={!customZoom}
              className="h-full w-full rounded-xl border border-border z-0"
              style={{ width: "100%", height: "100%", minHeight: fullscreen ? 0 : 400 }}
              scrollWheelZoom
            >
              {zoomPosition === "topright" ? <ZoomControl position="topright" /> : null}
              {zoomPosition === "bottomleft" ? <ZoomControl position="bottomleft" /> : null}
              {zoomPosition === "bottomright" ? <ZoomControl position="bottomright" /> : null}
              <MapPaneBearing degrees={bearingDeg} />
              <TileLayer
                attribution={TAXI_TILE_ATTRIBUTION}
                url={TAXI_TILE_LAYER_URL}
                subdomains={TAXI_TILE_SUBDOMAINS}
                maxZoom={TAXI_TILE_MAX_ZOOM}
              />
              <LeafletMapLayoutFix />
              {syncDefaultView ? <SyncBootstrapView center={defaultCenter} zoom={defaultZoom} /> : null}
              <MapClickLayer onPick={pickHandler} />
              {fitStart && fitEnd ? <FitRouteBounds start={fitStart} end={fitEnd} extra={markers} /> : null}
              {singleFocus && <FocusSinglePoint point={singleFocus} />}
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
                <CircleMarker
                  key={v.id}
                  center={[v.lat, v.lon]}
                  radius={v.kind === "driver" ? 9 : 8}
                  pathOptions={{
                    color: v.kind === "driver" ? "#0ea5e9" : "#b45309",
                    fillColor: v.kind === "driver" ? "#38bdf8" : "#fbbf24",
                    fillOpacity: 0.92,
                    weight: v.kind === "driver" ? 3 : 2,
                  }}
                />
              ))}
            </MapContainer>
          </div>
          {MAP_PERSPECTIVE_CONTROLS_VISIBLE ? (
            <MapPerspectiveControls
              tiltDeg={tiltDeg}
              onTiltChange={setTiltDeg}
              bearingDeg={bearingDeg}
              onBearingChange={setBearingDeg}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
