import { useEffect, useMemo } from "react";
import {
  CircleMarker,
  MapContainer,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
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
import { useEnsureMapGeolocation } from "@/lib/map-geolocation";
import { cn } from "@/lib/utils";
import type { StoreLocation } from "@shared/store-schema";
import { STORE_DELIVERY_PERIMETER_MAX_VERTICES } from "@shared/store-schema";
import { StoreDeliveryPerimeterMask } from "@/components/store/StoreDeliveryPerimeterMask";
import {
  safeInvalidateSize,
  safeLeafletCamera,
  safeStopLeafletMap,
} from "@/lib/safe-leaflet";

export type PerimeterPoint = { lat: number; lon: number };

const DEFAULT_CENTER: [number, number] = [-0.22, -78.5];

function MapClickAdd({
  disabled,
  onAdd,
}: {
  disabled?: boolean;
  onAdd: (lat: number, lon: number) => void;
}) {
  useMapEvents({
    click(e) {
      if (disabled) return;
      onAdd(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function FitPerimeterView({
  branchLocation,
  points,
}: {
  branchLocation: StoreLocation | null;
  points: PerimeterPoint[];
}) {
  const map = useMap();
  const key = useMemo(() => {
    const parts = points.map((p) => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`);
    if (branchLocation) {
      parts.unshift(`${branchLocation.lat.toFixed(5)},${branchLocation.lon.toFixed(5)}`);
    }
    return parts.join("|");
  }, [branchLocation, points]);

  useEffect(() => {
    let cancelled = false;
    let raf = 0;
    safeLeafletCamera(map, (live) => {
      if (points.length >= 2) {
        const bounds = L.latLngBounds(points.map((p) => L.latLng(p.lat, p.lon)));
        if (branchLocation) bounds.extend(L.latLng(branchLocation.lat, branchLocation.lon));
        live.fitBounds(bounds, { padding: [40, 40], maxZoom: 15, animate: false });
      } else if (branchLocation) {
        live.setView(L.latLng(branchLocation.lat, branchLocation.lon), 14, { animate: false });
      } else if (points.length === 1) {
        live.setView(L.latLng(points[0].lat, points[0].lon), 14, { animate: false });
      }
      raf = requestAnimationFrame(() => {
        if (!cancelled) safeInvalidateSize(live);
      });
    });
    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      safeStopLeafletMap(map);
    };
  }, [map, key, branchLocation, points]);

  return null;
}

type StoreDeliveryPerimeterMapProps = {
  branchLocation: StoreLocation | null;
  points: PerimeterPoint[];
  onChange: (points: PerimeterPoint[]) => void;
  disabled?: boolean;
  className?: string;
};

/**
 * Mapa para dibujar el polígono de cobertura de delivery (clicks = vértices).
 * No reutiliza SingleLocationPicker: función distinta.
 */
export function StoreDeliveryPerimeterMap({
  branchLocation,
  points,
  onChange,
  disabled,
  className,
}: StoreDeliveryPerimeterMapProps) {
  useEnsureMapGeolocation();
  const { theme } = useTheme();
  const raster = getTaxiRasterLayerProps(theme === "dark");
  const tileBehavior = getLeafletTileLayerBehaviorProps();
  const mapBehavior = getLeafletMapContainerBehaviorProps();
  const tileMaxZoom = getEffectiveLeafletMaxZoom(raster.maxZoom);
  const { shellRef, ready } = useDeferredLeafletMount({ minShellHeightPx: 64 });

  const center: [number, number] = branchLocation
    ? [branchLocation.lat, branchLocation.lon]
    : points[0]
      ? [points[0].lat, points[0].lon]
      : DEFAULT_CENTER;

  function addPoint(lat: number, lon: number) {
    if (disabled) return;
    if (points.length >= STORE_DELIVERY_PERIMETER_MAX_VERTICES) return;
    onChange([...points, { lat, lon }]);
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div
        ref={shellRef}
        className="relative h-[min(52vh,22rem)] w-full overflow-hidden rounded-2xl border border-border/70 bg-muted/30"
      >
        {ready ? (
          <MapContainer
            center={center}
            zoom={branchLocation || points.length ? 14 : 7}
            className="h-full w-full"
            {...mapBehavior}
          >
            <TileLayer
              attribution={raster.attribution}
              url={raster.url}
              maxZoom={tileMaxZoom}
              {...(raster.subdomains ? { subdomains: raster.subdomains } : {})}
              {...(raster.apiKey ? { apiKey: raster.apiKey } : {})}
              {...tileBehavior}
            />
            <LeafletMapLayoutFix />
            <GeoapifyMapAttribution />
            <FitPerimeterView branchLocation={branchLocation} points={points} />
            <MapClickAdd disabled={disabled} onAdd={addPoint} />
            {branchLocation ? (
              <CircleMarker
                center={[branchLocation.lat, branchLocation.lon]}
                radius={8}
                pathOptions={{
                  color: "#fff",
                  weight: 2,
                  fillColor: "hsl(var(--primary))",
                  fillOpacity: 1,
                }}
              />
            ) : null}
            {points.length >= 3 ? <StoreDeliveryPerimeterMask points={points} /> : null}
            {points.map((p, i) => (
              <CircleMarker
                key={`${p.lat}-${p.lon}-${i}`}
                center={[p.lat, p.lon]}
                radius={5}
                pathOptions={{
                  color: "#fff",
                  weight: 1.5,
                  fillColor: "hsl(var(--secondary))",
                  fillOpacity: 1,
                }}
              />
            ))}
          </MapContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Cargando mapa…
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Toca el mapa para añadir vértices del perímetro
        {points.length > 0 ? ` (${points.length} punto${points.length === 1 ? "" : "s"})` : ""}.
        Se necesitan al menos 3 para activar la zona.
      </p>
    </div>
  );
}
