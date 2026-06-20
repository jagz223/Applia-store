import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MapContainer, TileLayer, ZoomControl, useMap, useMapEvents, GeoJSON, CircleMarker } from "react-leaflet";
import L from "leaflet";
import { Loader2, LocateFixed, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GeoJsonObject } from "geojson";
import {
  getEffectiveLeafletMaxZoom,
  getLeafletMapContainerBehaviorProps,
  getLeafletRotateMapOptions,
  getLeafletTileLayerBehaviorProps,
  getTaxiRasterLayerProps,
} from "@/components/taxi/leaflet-config";
import { useTheme } from "@/contexts/ThemeContext";
import "@/components/taxi/leaflet-config";
import { LeafletMapLayoutFix } from "@/components/taxi/LeafletMapLayoutFix";
import { GeoapifyMapAttribution } from "@/components/taxi/GeoapifyMapAttribution";
import { useDeferredLeafletMount } from "@/hooks/useDeferredLeafletMount";
import { cn } from "@/lib/utils";
import { VehicleMapMarker } from "@/components/taxi/VehicleMapMarker";
import {
  bearingFromLatLon,
  headingFromGeolocation,
  smoothHeadingDeg,
} from "@/lib/vehicle-movement-heading";
import { LeafletMapMotionEnhancer } from "@/components/taxi/LeafletMapMotionEnhancer";
import { MapRotateControls } from "@/components/taxi/MapPerspectiveControls";

const DEFAULT_CENTER: [number, number] = [-0.22, -78.5];
const DEFAULT_ZOOM = 7;

/** Misma vista entre taxi ↔ delivery (rutas distintas remontan el mapa). */
const DRIVER_GO_MAP_VIEW_KEY = "genfeb.driverGo.mapView.v1";

type PersistedMapView = { lat: number; lng: number; zoom: number; at: number };

function readPersistedMapView(): PersistedMapView | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(DRIVER_GO_MAP_VIEW_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as Partial<PersistedMapView>;
    if (!Number.isFinite(j.lat) || !Number.isFinite(j.lng) || !Number.isFinite(j.zoom)) return null;
    if (Date.now() - (j.at ?? 0) > 7 * 24 * 60 * 60 * 1000) return null;
    return { lat: j.lat!, lng: j.lng!, zoom: Math.min(18, Math.max(4, j.zoom!)), at: j.at ?? Date.now() };
  } catch {
    return null;
  }
}

function writePersistedMapView(lat: number, lng: number, zoom: number): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      DRIVER_GO_MAP_VIEW_KEY,
      JSON.stringify({ lat, lng, zoom: Math.min(18, Math.max(4, zoom)), at: Date.now() }),
    );
  } catch {
    /* private mode / quota */
  }
}

function getInitialDriverMapFrame(): {
  center: [number, number];
  zoom: number;
  hadPersistedView: boolean;
} {
  const p = readPersistedMapView();
  if (p) {
    return { center: [p.lat, p.lng], zoom: p.zoom, hadPersistedView: true };
  }
  return { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM, hadPersistedView: false };
}

function WatchDriverPosition({
  onPosition,
  onHeading,
  trackHeading = false,
}: {
  onPosition: (p: { lat: number; lon: number } | null) => void;
  onHeading?: (deg: number | null) => void;
  trackHeading?: boolean;
}) {
  const prevRef = useRef<{ lat: number; lon: number } | null>(null);
  const headingRef = useRef<number | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) return;
    let cancelled = false;
    const apply = (pos: GeolocationPosition) => {
      if (cancelled) return;
      const next = {
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
      };
      onPosition(next);

      if (trackHeading && onHeading) {
        let target = headingFromGeolocation(pos.coords);
        if (target == null && prevRef.current) {
          target = bearingFromLatLon(prevRef.current, next);
        }
        headingRef.current = smoothHeadingDeg(headingRef.current, target);
        onHeading(headingRef.current);
      }

      prevRef.current = next;
    };
    navigator.geolocation.getCurrentPosition(
      apply,
      () => {
        /* timeout/permiso: no borrar marcador; el watch puede recuperar */
      },
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 25_000 },
    );
    const id = navigator.geolocation.watchPosition(
      apply,
      () => {
        /* errores transitorios del GPS: conservar última posición en el padre */
      },
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 60_000 },
    );
    return () => {
      cancelled = true;
      navigator.geolocation.clearWatch(id);
    };
  }, [onPosition, onHeading, trackHeading]);
  return null;
}

/** Guarda centro/zoom al mover el mapa (cambio taxi/delivery reusa la última vista). */
function PersistDriverMapView() {
  const map = useMap();
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const save = useCallback(() => {
    try {
      if (!map.getContainer()?.isConnected) return;
      const c = map.getCenter();
      writePersistedMapView(c.lat, c.lng, map.getZoom());
    } catch {
      /* desmontado */
    }
  }, [map]);
  useMapEvents({
    moveend: () => {
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = setTimeout(save, 450);
    },
    zoomend: () => {
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = setTimeout(save, 450);
    },
  });
  useEffect(
    () => () => {
      if (debounce.current) clearTimeout(debounce.current);
    },
    [],
  );
  return null;
}

/**
 * Solo la primera vez sin vista guardada: acerca al GPS. Si ya hay vista en sessionStorage (p. ej. tras cambiar de pestaña),
 * no movemos la cámara: el marcador sigue al conductor sin resetear el encuadre.
 */
function InitialFlyToGpsIfNoPersisted({
  hadPersistedView,
  me,
}: {
  hadPersistedView: boolean;
  me: { lat: number; lon: number } | null;
}) {
  const map = useMap();
  const done = useRef(false);
  useEffect(() => {
    if (hadPersistedView || !me || done.current) return;
    done.current = true;
    try {
      const c = map.getContainer();
      if (!c?.isConnected) return;
      map.setView(L.latLng(me.lat, me.lon), Math.max(map.getZoom(), 15), { animate: true });
      writePersistedMapView(me.lat, me.lon, Math.max(map.getZoom(), 15));
    } catch {
      /* contenedor Leaflet no listo o ya desmontado */
    }
  }, [hadPersistedView, map, me]);
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
  const lastPhaseKeyRef = useRef<string | null>(null);
  const hadMeForFitRef = useRef(false);
  useEffect(() => {
    if (!end) return;
    const anchor = me ?? start;
    if (!anchor) return;
    const phaseKey = `svc|${end.lat.toFixed(5)},${end.lon.toFixed(5)}|${start?.lat?.toFixed(5) ?? "x"},${start?.lon?.toFixed(5) ?? "x"}`;
    if (lastPhaseKeyRef.current !== phaseKey) hadMeForFitRef.current = false;
    const meJustArrived = !!me && !hadMeForFitRef.current;
    if (lastPhaseKeyRef.current === phaseKey && !meJustArrived) return;
    if (me) hadMeForFitRef.current = true;
    lastPhaseKeyRef.current = phaseKey;
    try {
      const c = map.getContainer();
      if (!c?.isConnected) return;
      const bounds = L.latLngBounds(L.latLng(end.lat, end.lon), L.latLng(anchor.lat, anchor.lon));
      map.fitBounds(bounds, { padding: [52, 52], maxZoom: 15 });
    } catch {
      /* mapa desmontándose */
    }
  }, [map, start?.lat, start?.lon, end?.lat, end?.lon, me?.lat, me?.lon]);
  return null;
}

function leafletTopPx(receiving: boolean, searchingClient: boolean): number {
  if (!receiving) return 10;
  let t = 78;
  if (searchingClient) t += 44;
  return t;
}

/** Alinea la columna de +/− con el mismo `top` que usan el banner; el centrar va en el mismo contenedor, debajo del zoom. */
function PositionLeafletZoomStack({
  fullscreen,
  receiving,
  searchingClient,
}: {
  fullscreen: boolean;
  receiving: boolean;
  searchingClient: boolean;
}) {
  const map = useMap();
  const top = leafletTopPx(receiving, searchingClient);
  useLayoutEffect(() => {
    const root = map.getContainer();
    const col = root.querySelector(
      fullscreen ? ".leaflet-top.leaflet-right" : ".leaflet-top.leaflet-left"
    ) as HTMLElement | null;
    if (!col) return;
    const prev = col.style.top;
    col.style.top = `${top}px`;
    return () => {
      col.style.top = prev;
    };
  }, [map, fullscreen, top]);
  return null;
}

/**
 * Mismo apilado que +/−: debajo del zoom. Siempre visible cuando `showRecenter`:
 * - con GPS ya conocido: centra el mapa en el conductor;
 * - si aún no hay fix (p. ej. permisos o timeout): vuelve a pedir ubicación con `getCurrentPosition`.
 */
function DriverMapRecenterToolbar({
  me,
  onLocated,
  fullscreen,
}: {
  me: { lat: number; lon: number } | null;
  onLocated: (p: { lat: number; lon: number }) => void;
  fullscreen: boolean;
}) {
  const map = useMap();
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [locating, setLocating] = useState(false);

  useLayoutEffect(() => {
    let root: HTMLElement;
    try {
      root = map.getContainer();
    } catch {
      return;
    }
    if (!root?.isConnected) return;

    const col = root.querySelector(
      fullscreen ? ".leaflet-top.leaflet-right" : ".leaflet-top.leaflet-left",
    ) as HTMLDivElement | null;
    if (!col) return;

    const el = document.createElement("div");
    el.setAttribute("data-genfeb", "driver-map-recenter");
    el.className = "leaflet-control";

    let raf = 0;
    let frame = 0;
    const maxFrames = 10;
    let done = false;

    const tryPlace = () => {
      if (done) return;
      try {
        if (!map.getContainer()?.isConnected || !col.isConnected) return;
      } catch {
        return;
      }
      const zoom = col.querySelector(".leaflet-control-zoom, .leaflet-bar") as HTMLElement | null;
      if (zoom) {
        zoom.after(el);
        setHost(el);
        done = true;
        return;
      }
      frame += 1;
      if (frame < maxFrames) {
        raf = requestAnimationFrame(tryPlace);
      } else {
        col.appendChild(el);
        setHost(el);
        done = true;
      }
    };

    raf = requestAnimationFrame(tryPlace);

    return () => {
      done = true;
      cancelAnimationFrame(raf);
      try {
        el.remove();
      } catch {
        /* ignore */
      }
      setHost(null);
    };
  }, [map, fullscreen]);

  const centerOn = useCallback(
    (lat: number, lon: number) => {
      try {
        if (!map.getContainer()?.isConnected) return;
        map.setView(L.latLng(lat, lon), Math.max(map.getZoom(), 15), { animate: true });
      } catch {
        /* mapa desmontado */
      }
    },
    [map]
  );

  const handleClick = useCallback(() => {
    if (me) {
      centerOn(me.lat, me.lon);
      return;
    }
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        onLocated(p);
        centerOn(p.lat, p.lon);
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 25_000 }
    );
  }, [me, onLocated, centerOn]);

  if (!host) return null;

  const hasFix = me != null;

  return createPortal(
    <div className="!mt-3 w-full border-t border-foreground/20 pt-3">
      <Button
        type="button"
        size="icon"
        variant="secondary"
        disabled={locating}
        className={cn(
          "h-12 w-12 rounded-full border-2 border-foreground/30 bg-background text-foreground",
          "shadow-md ring-2 ring-foreground/10 hover:bg-muted hover:ring-foreground/25",
          locating && "opacity-80"
        )}
        aria-label={hasFix ? "Centrar mapa en mi posición" : "Obtener mi ubicación y centrar el mapa"}
        title={hasFix ? "Centrar en mi posición" : "Buscar de nuevo mi GPS y centrar"}
        onClick={handleClick}
      >
        {locating ? (
          <Loader2 className="h-5 w-5 animate-spin text-foreground" aria-hidden />
        ) : hasFix ? (
          <Navigation className="h-5 w-5 text-foreground" strokeWidth={2.5} aria-hidden />
        ) : (
          <LocateFixed className="h-5 w-5 text-foreground" strokeWidth={2.5} aria-hidden />
        )}
      </Button>
    </div>,
    host
  );
}

export type DriverCargoMapProps = {
  vehicleType?: string | null;
  receiving?: boolean;
  /**
   * Conductor en fase de búsqueda del cliente: desplaza +/− y el botón de centrar hacia abajo
   * (misma lógica que al estar “en línea” con el aviso verde).
   */
  searchingClient?: boolean;
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
  /** Oculta el aviso inferior «Buscando tu ubicación…» (p. ej. cuando hay control deslizante encima). */
  hideLocationSearchingHint?: boolean;
};

export function DriverCargoMap({
  vehicleType,
  receiving = false,
  searchingClient = false,
  fullscreen = false,
  showRecenter = true,
  start = null,
  end = null,
  routeGeometry = null,
  routeRenderKey = 0,
  hideLocationSearchingHint = false,
}: DriverCargoMapProps) {
  const { theme } = useTheme();
  const raster = getTaxiRasterLayerProps(theme === "dark");
  const tileBehavior = getLeafletTileLayerBehaviorProps();
  const mapBehavior = getLeafletMapContainerBehaviorProps();
  const tileMaxZoom = getEffectiveLeafletMaxZoom(raster.maxZoom);
  const rotateOptions = getLeafletRotateMapOptions();
  const { shellRef, ready } = useDeferredLeafletMount({ minShellHeightPx: fullscreen ? 120 : 64 });
  const [me, setMe] = useState<{ lat: number; lon: number } | null>(null);
  const meRef = useRef<{ lat: number; lon: number } | null>(null);
  const onPosition = useCallback((p: { lat: number; lon: number } | null) => {
    if (p) {
      meRef.current = p;
      setMe(p);
    } else if (meRef.current) {
      setMe(meRef.current);
    }
  }, []);
  const [bearingDeg, setBearingDeg] = useState(0);
  const [vehicleHeadingDeg, setVehicleHeadingDeg] = useState<number | null>(null);
  const inService = end != null;

  const initialFrame = useMemo(() => getInitialDriverMapFrame(), []);

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
        <div className={fullscreen ? "relative h-full min-h-0 flex-1" : "relative h-full min-h-[260px]"}>
          <div
            className={
              fullscreen
                ? "h-full w-full overflow-hidden rounded-none"
                : "h-full w-full overflow-hidden rounded-2xl"
            }
          >
            <MapContainer
              center={initialFrame.center}
              zoom={initialFrame.zoom}
              attributionControl={false}
              zoomControl={!fullscreen}
              className={fullscreen ? "z-0 h-full w-full rounded-none" : "z-0 h-full w-full rounded-2xl"}
              style={{ width: "100%", height: "100%", minHeight: fullscreen ? 0 : 260 }}
              scrollWheelZoom
              maxZoom={tileMaxZoom}
              {...mapBehavior}
              {...rotateOptions}
            >
              {/* topright: evita solaparse con chips/banners en la esquina superior izquierda del overlay */}
              {fullscreen ? <ZoomControl position="topright" /> : null}
              <PositionLeafletZoomStack
                fullscreen={!!fullscreen}
                receiving={receiving}
                searchingClient={searchingClient}
              />
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
              <PersistDriverMapView />
              <WatchDriverPosition
                onPosition={onPosition}
                onHeading={setVehicleHeadingDeg}
                trackHeading={inService}
              />
              {showRecenter ? (
                <DriverMapRecenterToolbar me={me} onLocated={onPosition} fullscreen={!!fullscreen} />
              ) : null}
              {me ? (
                <>
                  <VehicleMapMarker
                    position={[me.lat, me.lon]}
                    vehicleType={vehicleType}
                    headingDeg={vehicleHeadingDeg}
                    rotateWithHeading={inService}
                    interactive={false}
                    zIndexOffset={600}
                  />
                  <InitialFlyToGpsIfNoPersisted hadPersistedView={initialFrame.hadPersistedView} me={me} />
                </>
              ) : null}
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
          <GeoapifyMapAttribution />
          <MapRotateControls bearingDeg={bearingDeg} onBearingChange={setBearingDeg} />
        </div>
      )}
      {!hideLocationSearchingHint && !me && ready && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-3">
          <p className="rounded-full border border-border bg-background/90 px-3 py-1.5 text-xs text-muted-foreground shadow">
            Buscando tu ubicación… activa el GPS. Si tarda, usa el botón de ubicación junto a +/− en el mapa para
            intentar de nuevo.
          </p>
        </div>
      )}
    </div>
  );
}
