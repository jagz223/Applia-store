import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, ZoomControl, useMap, GeoJSON, CircleMarker } from "react-leaflet";
import L from "leaflet";
import { Loader2, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GeoJsonObject } from "geojson";
import {
  TAXI_TILE_ATTRIBUTION,
  TAXI_TILE_LAYER_URL,
  TAXI_TILE_MAX_ZOOM,
  TAXI_TILE_SUBDOMAINS,
} from "@/components/taxi/leaflet-config";
import "@/components/taxi/leaflet-config";
import { LeafletMapLayoutFix } from "@/components/taxi/LeafletMapLayoutFix";
import { useDeferredLeafletMount } from "@/hooks/useDeferredLeafletMount";
import { cn } from "@/lib/utils";
import { createDriverVehicleIcon } from "@/components/driver/cargo-map-markers";
import {
  MAP_PERSPECTIVE_CONTROLS_VISIBLE,
  MapPaneBearing,
  MapPerspectiveControls,
} from "@/components/taxi/MapPerspectiveControls";

const DEFAULT_CENTER: [number, number] = [-0.22, -78.5];
const DEFAULT_ZOOM = 7;

function WatchDriverPosition({
  onPosition,
}: {
  onPosition: (p: { lat: number; lon: number } | null) => void;
}) {
  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        onPosition({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
        });
      },
      () => onPosition(null),
      { enableHighAccuracy: true, maximumAge: 4000, timeout: 20_000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [onPosition]);
  return null;
}

function FlyToFirstFix({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    map.setView(L.latLng(lat, lon), Math.max(map.getZoom(), 15), { animate: true });
    requestAnimationFrame(() => map.invalidateSize({ animate: false }));
  }, [map, lat, lon]);
  return null;
}

function FitToService({
  start,
  end,
  me,
}: {
  start: { lat: number; lon: number } | null;
  end: { lat: number; lon: number } | null;
  me: { lat: number; lon: number } | null;
}) {
  const map = useMap();
  useEffect(() => {
    if (!end) return;
    if (!me && !start) return;
    try {
      const c = map.getContainer();
      if (!c?.isConnected) return;
      const bounds = L.latLngBounds(L.latLng(end.lat, end.lon), L.latLng(end.lat, end.lon));
      if (me) bounds.extend(L.latLng(me.lat, me.lon));
      else if (start) bounds.extend(L.latLng(start.lat, start.lon));
      map.fitBounds(bounds, { padding: [52, 52], maxZoom: 15 });
      requestAnimationFrame(() => map.invalidateSize({ animate: false }));
    } catch {
      /* mapa desmontándose */
    }
  }, [map, start?.lat, start?.lon, end?.lat, end?.lon, me?.lat, me?.lon]);
  return null;
}

function RecenterControl({ me }: { me: { lat: number; lon: number } }) {
  const map = useMap();
  return (
    <div className="pointer-events-none absolute right-3 top-3 z-[400]">
      <Button
        type="button"
        size="icon"
        variant="secondary"
        className="pointer-events-auto h-11 w-11 rounded-full border border-border bg-background/93 shadow-lg backdrop-blur-sm"
        aria-label="Centrar mapa en mi posición"
        onClick={() => {
          map.setView(L.latLng(me.lat, me.lon), Math.max(map.getZoom(), 15), { animate: true });
          requestAnimationFrame(() => map.invalidateSize({ animate: false }));
        }}
      >
        <Navigation className="h-5 w-5" />
      </Button>
    </div>
  );
}

export type DriverCargoMapProps = {
  vehicleType?: string | null;
  receiving?: boolean;
  /** Contenedor al 100% del padre (vista conductor móvil a pantalla). */
  fullscreen?: boolean;
  /** En móvil a pantalla completa se oculta la brújula (no solapar con la cabecera). */
  showRecenter?: boolean;
  /** Ruta/markers del servicio (p. ej. driver→recogida). */
  start?: { lat: number; lon: number } | null;
  end?: { lat: number; lon: number } | null;
  routeGeometry?: GeoJsonObject | null;
  /** Forzar remount de GeoJSON cuando cambia la ruta (Leaflet a veces no redibuja solo con `data`). */
  routeRenderKey?: number;
};

export function DriverCargoMap({
  vehicleType,
  receiving = false,
  fullscreen = false,
  showRecenter = true,
  start = null,
  end = null,
  routeGeometry = null,
  routeRenderKey = 0,
}: DriverCargoMapProps) {
  const { shellRef, ready } = useDeferredLeafletMount({ minShellHeightPx: fullscreen ? 120 : 64 });
  const [me, setMe] = useState<{ lat: number; lon: number } | null>(null);
  const onPosition = useCallback((p: { lat: number; lon: number } | null) => setMe(p), []);
  const [tiltDeg, setTiltDeg] = useState(0);
  const [bearingDeg, setBearingDeg] = useState(0);

  const driverIcon = useMemo(() => createDriverVehicleIcon(vehicleType), [vehicleType]);

  const shellStyle = fullscreen
    ? ({ width: "100%", height: "100%", minHeight: 0, maxHeight: "none" } as const)
    : ({
        width: "100%",
        minHeight: "min(55vh, 520px)",
        height: "48vh",
        maxHeight: 560,
      } as const);

  return (
    <div
      ref={shellRef}
      className={
        fullscreen
          ? cn(
              "genfeb-driver-map-fs relative z-[1] h-full min-h-0 w-full overflow-hidden bg-muted/30",
              receiving && "genfeb-driver-map-fs-receiving"
            )
          : "relative z-[1] w-full overflow-hidden rounded-2xl border border-border ring-2 ring-primary/20 ring-offset-2 ring-offset-background"
      }
      style={shellStyle}
    >
      {!ready ? (
        <div
          className={
            fullscreen
              ? "flex h-full min-h-[120px] w-full flex-1 items-center justify-center gap-2 rounded-none border-0 bg-muted/30 text-sm text-muted-foreground"
              : "flex h-full min-h-[280px] w-full items-center justify-center gap-2 rounded-2xl border border-border bg-muted/30 text-sm text-muted-foreground"
          }
        >
          <Loader2 className="h-6 w-6 animate-spin shrink-0" aria-hidden />
          Preparando mapa…
        </div>
      ) : (
        <div
          className={
            fullscreen
              ? "relative h-full min-h-0 flex-1 [perspective:960px]"
              : "relative h-full min-h-[260px] [perspective:960px]"
          }
        >
          <div
            className={
              fullscreen
                ? "h-full w-full overflow-hidden rounded-none transition-transform duration-300 ease-out"
                : "h-full w-full overflow-hidden rounded-2xl transition-transform duration-300 ease-out"
            }
            style={{ transform: `rotateX(${tiltDeg}deg)` }}
          >
            <MapContainer
              center={me ? [me.lat, me.lon] : DEFAULT_CENTER}
              zoom={me ? 15 : DEFAULT_ZOOM}
              attributionControl={false}
              zoomControl={!fullscreen}
              className={fullscreen ? "z-0 h-full w-full rounded-none" : "z-0 h-full w-full rounded-2xl"}
              style={{ width: "100%", height: "100%", minHeight: fullscreen ? 0 : 260 }}
              scrollWheelZoom
            >
              {/* topright: evita solaparse con chips/banners en la esquina superior izquierda del overlay */}
              {fullscreen ? <ZoomControl position="topright" /> : null}
              <MapPaneBearing degrees={bearingDeg} />
              <TileLayer
                attribution={TAXI_TILE_ATTRIBUTION}
                url={TAXI_TILE_LAYER_URL}
                subdomains={TAXI_TILE_SUBDOMAINS}
                maxZoom={TAXI_TILE_MAX_ZOOM}
              />
              <LeafletMapLayoutFix />
              <WatchDriverPosition onPosition={onPosition} />
              {me && (
                <>
                  <Marker position={[me.lat, me.lon]} icon={driverIcon} interactive={false} zIndexOffset={600} />
                  <FlyToFirstFix lat={me.lat} lon={me.lon} />
                  {showRecenter ? <RecenterControl me={me} /> : null}
                </>
              )}
              {end ? <FitToService start={start} end={end} me={me} /> : null}
              {start ? (
                <CircleMarker
                  center={[start.lat, start.lon]}
                  radius={10}
                  pathOptions={{ color: "#15803d", fillColor: "#22c55e", fillOpacity: 0.85, weight: 2 }}
                />
              ) : null}
              {end ? (
                <CircleMarker
                  center={[end.lat, end.lon]}
                  radius={10}
                  pathOptions={{ color: "#b91c1c", fillColor: "#ef4444", fillOpacity: 0.85, weight: 2 }}
                />
              ) : null}
              {routeGeometry ? (
                <GeoJSON
                  key={routeRenderKey}
                  data={routeGeometry}
                  style={{
                    color: "#2563eb",
                    weight: 5,
                    opacity: 0.88,
                  }}
                />
              ) : null}
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
      {!me && ready && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-3">
          <p className="rounded-full border border-border bg-background/90 px-3 py-1.5 text-xs text-muted-foreground shadow">
            Buscando tu ubicación… activa el GPS si no aparece.
          </p>
        </div>
      )}
    </div>
  );
}
