import { useCallback, useEffect, useRef, useState } from "react";
import { GeoJSON, MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import type { GeoJsonObject } from "geojson";
import L from "leaflet";
import { Loader2, MapPin, Navigation } from "lucide-react";
import type { StoreDeliveryFares, StoreLocation } from "@shared/store-schema";
import {
  computeStoreDeliveryFeeUsd,
  DEFAULT_STORE_DELIVERY_FARES,
  normalizeStoreDeliveryFares,
} from "@shared/store-schema";
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
import { useEnsureMapGeolocation } from "@/lib/map-geolocation";
import { safeInvalidateSize, safeLeafletCamera, safeStopLeafletMap } from "@/lib/safe-leaflet";
import type { PickedLocation } from "@/components/taxi/SingleLocationPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type MapPoint = { lat: number; lon: number };
type GeocodeHit = { lat: number; lon: number; label: string };

export type StoreDeliveryQuote = {
  distanceM: number;
  deliveryFee: number;
};

function formatKm(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

function formatPrice(value: number) {
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(value);
}

function themeHsl(cssVar: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
  return raw ? `hsl(${raw})` : fallback;
}

function createLabeledMarkerIcon(label: string, variant: "origin" | "destination") {
  const bg =
    variant === "origin"
      ? themeHsl("--primary", "#2e2a27")
      : themeHsl("--secondary", "#d94a3d");
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
    let raf = 0;
    safeLeafletCamera(map, (live) => {
      const bounds = L.latLngBounds(L.latLng(start.lat, start.lon), L.latLng(end.lat, end.lon));
      live.fitBounds(bounds, { padding: [48, 48], maxZoom: 15, animate: false });
      raf = requestAnimationFrame(() => {
        if (!cancelled) safeInvalidateSize(live);
      });
    });
    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      safeStopLeafletMap(map);
    };
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
    let raf = 0;
    safeLeafletCamera(map, (live) => {
      live.setView(L.latLng(point.lat, point.lon), z, { animate: false });
      raf = requestAnimationFrame(() => {
        if (!cancelled) safeInvalidateSize(live);
      });
    });
    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      safeStopLeafletMap(map);
    };
  }, [map, point.lat, point.lon]);
  return null;
}

function MapClickPick({
  disabled,
  onPick,
}: {
  disabled?: boolean;
  onPick: (lat: number, lon: number) => void;
}) {
  useMapEvents({
    click(e) {
      if (disabled) return;
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

type StoreCheckoutDeliverySectionProps = {
  storeLocation: StoreLocation;
  deliveryFares?: StoreDeliveryFares | null;
  value: PickedLocation | null;
  onChange: (place: PickedLocation | null) => void;
  onQuoteChange: (quote: StoreDeliveryQuote | null) => void;
  disabled?: boolean;
  /**
   * Si es false (p. ej. al cerrar el diálogo de compra), no monta Leaflet.
   * Evita `_leaflet_pos` durante la animación de cierre del Dialog.
   */
  mapEnabled?: boolean;
};

export function StoreCheckoutDeliverySection({
  storeLocation,
  deliveryFares,
  value,
  onChange,
  onQuoteChange,
  disabled,
  mapEnabled = true,
}: StoreCheckoutDeliverySectionProps) {
  useEnsureMapGeolocation();
  const { theme } = useTheme();
  const { shellRef, ready } = useDeferredLeafletMount({ minShellHeightPx: 220 });

  const [input, setInput] = useState(value?.label ?? "");
  const [suggestions, setSuggestions] = useState<GeocodeHit[]>([]);
  const [geoLoading, setGeoLoading] = useState(false);
  const [reverseLoading, setReverseLoading] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [routeGeometry, setRouteGeometry] = useState<GeoJsonObject | null>(null);
  const [distanceM, setDistanceM] = useState<number | null>(null);
  const [deliveryFee, setDeliveryFee] = useState<number | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const onQuoteChangeRef = useRef(onQuoteChange);
  onQuoteChangeRef.current = onQuoteChange;

  const raster = getTaxiRasterLayerProps(theme === "dark");
  const tileBehavior = getLeafletTileLayerBehaviorProps();
  const mapBehavior = getLeafletMapContainerBehaviorProps();
  const tileMaxZoom = getEffectiveLeafletMaxZoom(raster.maxZoom);

  const origin: MapPoint = { lat: storeLocation.lat, lon: storeLocation.lon };
  const destination = value ? { lat: value.lat, lon: value.lon } : null;
  const hasBoth = destination != null;
  const fares = normalizeStoreDeliveryFares(deliveryFares ?? DEFAULT_STORE_DELIVERY_FARES);

  useEffect(() => {
    setInput(value?.label ?? "");
  }, [value?.label, value?.lat, value?.lon]);

  useEffect(() => {
    if (!destination) {
      setRouteGeometry(null);
      setDistanceM(null);
      setDeliveryFee(null);
      setRouteLoading(false);
      setRouteError(null);
      onQuoteChangeRef.current(null);
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
          setRouteError(errorMessage ?? "No se pudo trazar la ruta por calles. Intenta de nuevo.");
          setDistanceM(null);
          setDeliveryFee(null);
          onQuoteChangeRef.current(null);
          return;
        }

        setRouteGeometry(route.geometry);
        setDistanceM(route.distanceM);
        const fee = computeStoreDeliveryFeeUsd(fares, route.distanceM);
        setDeliveryFee(fee);
        onQuoteChangeRef.current({ distanceM: route.distanceM, deliveryFee: fee });
      } catch {
        if (cancelled) return;
        setRouteError("No se pudo conectar al servicio de rutas. Revisa tu red e intenta otra vez.");
        setDistanceM(null);
        setDeliveryFee(null);
        onQuoteChangeRef.current(null);
      } finally {
        if (!cancelled) setRouteLoading(false);
      }
    }

    void loadRoute();
    return () => {
      cancelled = true;
    };
    // fares as primitives to avoid object identity churn
    // eslint-disable-next-line react-hooks/exhaustive-deps -- origin/destination coords
  }, [destination?.lat, destination?.lon, origin.lat, origin.lon, fares.baseUsd, fares.perKmUsd]);

  const reverseAt = useCallback(async (lat: number, lon: number) => {
    setReverseLoading(true);
    try {
      const res = await fetch(`/api/maps/reverse?lat=${lat}&lon=${lon}`);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { label: string };
      return {
        lat,
        lon,
        label: data.label?.trim() || `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
      } satisfies PickedLocation;
    } catch {
      return { lat, lon, label: `${lat.toFixed(5)}, ${lon.toFixed(5)}` };
    } finally {
      setReverseLoading(false);
    }
  }, []);

  const fetchGeocode = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      return;
    }
    setGeoLoading(true);
    try {
      const res = await fetch(`/api/maps/geocode?q=${encodeURIComponent(trimmed)}`);
      const data = res.ok ? ((await res.json()) as GeocodeHit[]) : [];
      setSuggestions(Array.isArray(data) ? data : []);
    } catch {
      setSuggestions([]);
    } finally {
      setGeoLoading(false);
    }
  }, []);

  function onInputChange(v: string) {
    setInput(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void fetchGeocode(v), 380);
  }

  function pickHit(hit: GeocodeHit) {
    onChange({ lat: hit.lat, lon: hit.lon, label: hit.label });
    setInput(hit.label);
    setSuggestions([]);
  }

  async function onMapPick(lat: number, lon: number) {
    if (disabled) return;
    const place = await reverseAt(lat, lon);
    onChange(place);
    setInput(place.label);
    setSuggestions([]);
  }

  function useGps() {
    if (!navigator.geolocation || disabled) return;
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const place = await reverseAt(latitude, longitude);
        onChange(place);
        setInput(place.label);
        setGpsLoading(false);
      },
      () => setGpsLoading(false),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 25_000 },
    );
  }

  const center: [number, number] = destination
    ? [destination.lat, destination.lon]
    : [origin.lat, origin.lon];

  return (
    <div className="space-y-3 rounded-2xl border border-border/70 bg-card p-3.5 sm:space-y-4 sm:p-4">
      <div>
        <h3 className="text-sm font-semibold">Entrega a domicilio</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Origen: {storeLocation.label}. Indica dónde recibirás el pedido.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="relative min-w-0 flex-1 space-y-2">
          <Label htmlFor="checkout-delivery-address">Dirección de entrega</Label>
          <div className="relative">
            <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="checkout-delivery-address"
              className="h-11 rounded-2xl pl-10"
              placeholder="Busca una dirección o toca el mapa"
              value={input}
              disabled={disabled}
              onChange={(e) => onInputChange(e.target.value)}
              autoComplete="off"
            />
            {suggestions.length > 0 ? (
              <ul className="absolute z-[3000] top-full mt-1 max-h-44 w-full overflow-auto rounded-xl border bg-popover text-sm shadow-md">
                {suggestions.map((h, i) => (
                  <li key={`${h.lat}-${h.lon}-${i}`}>
                    <button
                      type="button"
                      className="w-full px-3 py-2.5 text-left hover:bg-muted"
                      onClick={() => pickHit(h)}
                    >
                      {h.label}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
        <Button
          type="button"
          className="h-11 shrink-0 gap-2 rounded-full"
          onClick={useGps}
          disabled={disabled || gpsLoading}
        >
          {gpsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
          Usar mi ubicación
        </Button>
      </div>

      <div
        ref={shellRef}
        className="relative h-48 min-h-[12rem] overflow-hidden rounded-xl border border-border sm:h-56"
      >
        {!ready || !mapEnabled ? (
          <div className="flex h-full items-center justify-center bg-muted/20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <MapContainer
              center={center}
              zoom={14}
              maxZoom={tileMaxZoom}
              className="h-full w-full z-0"
              {...mapBehavior}
            >
              <LeafletMapLayoutFix />
              <TileLayer {...raster} {...tileBehavior} />
              <MapClickPick disabled={disabled} onPick={(lat, lon) => void onMapPick(lat, lon)} />
              {hasBoth && destination ? (
                <FitRouteBounds start={origin} end={destination} />
              ) : (
                <FocusSinglePoint point={origin} />
              )}
              {hasBoth && routeGeometry ? (
                <GeoJSON
                  key={`${origin.lat}-${origin.lon}-${destination!.lat}-${destination!.lon}`}
                  data={routeGeometry}
                  style={ROAD_ROUTE_MAP_STYLE}
                />
              ) : null}
              <Marker
                position={[origin.lat, origin.lon]}
                icon={createLabeledMarkerIcon("Inicio", "origin")}
              />
              {destination ? (
                <Marker
                  position={[destination.lat, destination.lon]}
                  icon={createLabeledMarkerIcon("Destino", "destination")}
                />
              ) : null}
            </MapContainer>
            <GeoapifyMapAttribution />
          </>
        )}
        {(reverseLoading || geoLoading) && (
          <div className="absolute top-2 right-2 rounded-md bg-background/90 border border-border px-2 py-1 text-xs flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Buscando…
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
        {routeLoading ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Calculando ruta…
          </span>
        ) : routeError ? (
          <span className="text-destructive">{routeError}</span>
        ) : distanceM != null ? (
          <span>
            Distancia: <span className="font-medium text-foreground">{formatKm(distanceM)}</span>
          </span>
        ) : (
          <span>Selecciona un destino para calcular la ruta.</span>
        )}
        {deliveryFee != null && !routeLoading && !routeError ? (
          <span>
            Envío:{" "}
            <span className="font-medium text-foreground">{formatPrice(deliveryFee)}</span>
          </span>
        ) : null}
      </div>
    </div>
  );
}
