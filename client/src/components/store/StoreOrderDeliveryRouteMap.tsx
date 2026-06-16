import { useEffect, useRef, useState } from "react";
import { GeoJSON, MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import type { GeoJsonObject } from "geojson";
import L from "leaflet";
import {
  getEffectiveLeafletMaxZoom,
  getLeafletMapContainerBehaviorProps,
  getLeafletTileLayerBehaviorProps,
  getTaxiRasterLayerProps,
} from "@/components/taxi/leaflet-config";
import { useTheme } from "@/contexts/ThemeContext";
import { LeafletMapLayoutFix } from "@/components/taxi/LeafletMapLayoutFix";
import { GeoapifyMapAttribution } from "@/components/taxi/GeoapifyMapAttribution";
import "@/components/taxi/leaflet-config";
import { useDeferredLeafletMount } from "@/hooks/useDeferredLeafletMount";
import { fetchRoadDrivingRoute, ROAD_ROUTE_MAP_STYLE } from "@/lib/load-driving-route";
import { mapBoundsFitKey, mapPointFitKey } from "@/lib/leaflet-map-camera";
import { isLeafletMapContainerLive, safeInvalidateSize } from "@/lib/safe-leaflet";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type MapPoint = { lat: number; lon: number };

function formatKm(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

function createLabeledMarkerIcon(label: string, variant: "origin" | "destination") {
  const bg = variant === "origin" ? "#2563eb" : "#16a34a";
  return L.divIcon({
    className: "",
    html: `
      <div style="display:flex;flex-direction:column;align-items:center;gap:3px;transform:translate(-50%,-100%);pointer-events:none;">
        <span style="background:${bg};color:#fff;font-size:11px;font-weight:600;padding:2px 8px;border-radius:9999px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.25);">${label}</span>
        <span style="width:12px;height:12px;background:${bg};border:2px solid white;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,.3);"></span>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
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
      map.fitBounds(bounds, { padding: [48, 48], maxZoom: 15 });
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

function FocusSinglePoint({ point }: { point: MapPoint }) {
  const map = useMap();
  const lastKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const z = Math.max(map.getZoom(), 14);
    const key = mapPointFitKey(point, z);
    if (lastKeyRef.current === key) return;
    lastKeyRef.current = key;
    let cancelled = false;
    try {
      if (!isLeafletMapContainerLive(map)) return;
      map.setView(L.latLng(point.lat, point.lon), z, { animate: true });
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
  }, [map, point.lat, point.lon]);
  return null;
}

type StoreOrderDeliveryRouteMapProps = {
  origin: MapPoint | null;
  destination: MapPoint | null;
  /** Tarifa de envío guardada en la orden (orientativa). */
  deliveryFee?: number | null;
  /** Distancia guardada en la orden si la ruta en vivo no está disponible. */
  fallbackDistanceM?: number | null;
  className?: string;
};

function formatPrice(value: number) {
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(value);
}

export function StoreOrderDeliveryRouteMap({
  origin,
  destination,
  deliveryFee,
  fallbackDistanceM,
  className,
}: StoreOrderDeliveryRouteMapProps) {
  const { theme } = useTheme();
  const { shellRef, ready } = useDeferredLeafletMount();
  const raster = getTaxiRasterLayerProps(theme === "dark");
  const tileBehavior = getLeafletTileLayerBehaviorProps();
  const mapBehavior = getLeafletMapContainerBehaviorProps();
  const tileMaxZoom = getEffectiveLeafletMaxZoom(raster.maxZoom);

  const [routeGeometry, setRouteGeometry] = useState<GeoJsonObject | null>(null);
  const [distanceM, setDistanceM] = useState<number | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  const hasBoth = origin != null && destination != null;
  const singlePoint = hasBoth ? null : (destination ?? origin);

  useEffect(() => {
    if (!origin || !destination) {
      setRouteGeometry(null);
      setDistanceM(null);
      setRouteLoading(false);
      setRouteError(null);
      return;
    }

    let cancelled = false;
    const start = origin;
    const end = destination;

    async function loadRoute() {
      setRouteLoading(true);
      setRouteError(null);
      setRouteGeometry(null);

      try {
        const { route, errorMessage } = await fetchRoadDrivingRoute(start, end);
        if (cancelled) return;
        if (!route) {
          setRouteError(errorMessage ?? "No se pudo trazar la ruta por calles.");
          setDistanceM(null);
          return;
        }
        setRouteGeometry(route.geometry);
        setDistanceM(route.distanceM);
      } catch {
        if (cancelled) return;
        setRouteError("No se pudo conectar al servicio de rutas.");
        setDistanceM(null);
      } finally {
        if (!cancelled) setRouteLoading(false);
      }
    }

    void loadRoute();
    return () => {
      cancelled = true;
    };
  }, [origin, destination]);

  const center: [number, number] = destination
    ? [destination.lat, destination.lon]
    : origin
      ? [origin.lat, origin.lon]
      : [-0.22, -78.5];

  const displayDistanceM = distanceM ?? fallbackDistanceM ?? null;

  if (!origin && !destination) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-md border border-dashed border-border bg-muted/30 text-sm text-muted-foreground min-h-[280px]",
          className,
        )}
      >
        Sin ubicaciones para mostrar en el mapa.
      </div>
    );
  }

  if (!ready) {
    return (
      <div className={cn("space-y-2", className)}>
        <div
          ref={shellRef}
          className="flex items-center justify-center rounded-md border border-border bg-muted/20 min-h-[280px]"
        >
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
        {hasBoth ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Calculando distancia…
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn("rounded-lg border border-border overflow-hidden bg-card", className)}>
      <div
        ref={shellRef}
        className="relative overflow-hidden min-h-[240px] h-56 sm:h-64"
      >
        <MapContainer
          center={center}
          zoom={14}
          maxZoom={tileMaxZoom}
          className="h-full w-full z-0"
          {...mapBehavior}
        >
          <LeafletMapLayoutFix />
          <TileLayer {...raster} {...tileBehavior} />
          {hasBoth && origin && destination ? <FitRouteBounds start={origin} end={destination} /> : null}
          {singlePoint ? <FocusSinglePoint point={singlePoint} /> : null}
          {hasBoth && routeGeometry ? (
            <GeoJSON
              key={`${origin!.lat}-${origin!.lon}-${destination!.lat}-${destination!.lon}`}
              data={routeGeometry}
              style={ROAD_ROUTE_MAP_STYLE}
            />
          ) : null}
          {origin ? (
            <Marker
              position={[origin.lat, origin.lon]}
              icon={createLabeledMarkerIcon("Inicio", "origin")}
            />
          ) : null}
          {destination ? (
            <Marker
              position={[destination.lat, destination.lon]}
              icon={createLabeledMarkerIcon("Destino", "destination")}
            />
          ) : null}
        </MapContainer>
        <GeoapifyMapAttribution />
      </div>

      {hasBoth ? (
        <div className="border-t border-border bg-muted/15 px-3 py-2.5 space-y-1.5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {routeLoading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Calculando ruta…
              </span>
            ) : routeError ? (
              <span className="text-destructive">{routeError}</span>
            ) : displayDistanceM != null ? (
              <span>
                Distancia estimada:{" "}
                <span className="font-medium text-foreground">{formatKm(displayDistanceM)}</span>
              </span>
            ) : null}
            {deliveryFee != null && deliveryFee > 0 ? (
              <span>
                Envío:{" "}
                <span className="font-medium text-foreground">{formatPrice(deliveryFee)}</span>
              </span>
            ) : null}
          </div>
          {deliveryFee != null && deliveryFee > 0 ? (
            <p className="text-xs text-muted-foreground">
              Incluido en el total pagado a la tienda.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
