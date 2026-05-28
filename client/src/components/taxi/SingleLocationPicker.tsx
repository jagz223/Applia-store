import { useCallback, useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, useMap, useMapEvents } from "react-leaflet";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, MapPin, Navigation } from "lucide-react";
import { cn } from "@/lib/utils";

export type PickedLocation = { lat: number; lon: number; label: string };

type GeocodeHit = { lat: number; lon: number; label: string };

const DEFAULT_CENTER: [number, number] = [-0.22, -78.5];
const DEFAULT_ZOOM = 7;

function MapClickPick({ onPick }: { onPick: (lat: number, lon: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function CenterOnMarker({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap();
  useEffect(() => {
    const z = Math.max(map.getZoom(), 14);
    map.setView(L.latLng(lat, lon), z, { animate: true });
    requestAnimationFrame(() => map.invalidateSize({ animate: false }));
  }, [map, lat, lon]);
  return null;
}

export interface SingleLocationPickerProps {
  value: PickedLocation | null;
  onChange: (place: PickedLocation | null) => void;
  /** Texto del campo de búsqueda. */
  fieldLabel?: string;
  /** `sm` = mapa más bajo (booking, diálogo chat). */
  mapSize?: "default" | "sm";
  className?: string;
}

/**
 * Un solo punto en el mapa (Leaflet + misma API `/api/maps/*` que Car Go): búsqueda, toque en mapa o GPS.
 */
export function SingleLocationPicker({
  value,
  onChange,
  fieldLabel = "Ubicación",
  mapSize = "default",
  className,
}: SingleLocationPickerProps) {
  const { theme } = useTheme();
  const raster = getTaxiRasterLayerProps(theme === "dark");
  const tileBehavior = getLeafletTileLayerBehaviorProps();
  const mapBehavior = getLeafletMapContainerBehaviorProps();
  const tileMaxZoom = getEffectiveLeafletMaxZoom(raster.maxZoom);
  const { shellRef, ready } = useDeferredLeafletMount({
    minShellHeightPx: mapSize === "sm" ? 48 : 64,
  });
  const [input, setInput] = useState(value?.label ?? "");
  const [suggestions, setSuggestions] = useState<GeocodeHit[]>([]);
  const [geoLoading, setGeoLoading] = useState(false);
  const [reverseLoading, setReverseLoading] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setInput(value?.label ?? "");
  }, [value?.label, value?.lat, value?.lon]);

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
      } as PickedLocation;
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

  const onInputChange = (v: string) => {
    setInput(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchGeocode(v), 380);
  };

  const pickHit = (hit: GeocodeHit) => {
    onChange({ lat: hit.lat, lon: hit.lon, label: hit.label });
    setInput(hit.label);
    setSuggestions([]);
  };

  const onMapPick = async (lat: number, lon: number) => {
    const place = await reverseAt(lat, lon);
    onChange(place);
    setInput(place.label);
    setSuggestions([]);
  };

  const useGps = () => {
    if (!navigator.geolocation) return;
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
      { enableHighAccuracy: true, maximumAge: 0, timeout: 25_000 }
    );
  };

  const marker = value ? { lat: value.lat, lon: value.lon } : null;

  const shellStyle =
    mapSize === "sm"
      ? ({ width: "100%", minHeight: 280, height: "min(36vh, 360px)", maxHeight: 360 } as const)
      : ({ width: "100%", minHeight: 420, height: "52vh", maxHeight: 640 } as const);

  const placeholderMinH = mapSize === "sm" ? "min-h-[280px]" : "min-h-[420px]";

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="relative flex-1 min-w-0 space-y-2">
          <Label htmlFor="single-location-input">{fieldLabel}</Label>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              id="single-location-input"
              className="pl-10"
              placeholder="Busca una dirección o toca el mapa"
              value={input}
              onChange={(e) => onInputChange(e.target.value)}
              autoComplete="off"
            />
            {suggestions.length > 0 && (
              <ul className="absolute z-[3000] top-full mt-1 w-full max-h-44 overflow-auto rounded-md border bg-popover text-sm shadow-md">
                {suggestions.map((h, i) => (
                  <li key={`${h.lat}-${h.lon}-${i}`}>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-muted"
                      onClick={() => pickHit(h)}
                    >
                      {h.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="default"
          className="shrink-0 gap-2 sm:mb-0.5"
          onClick={useGps}
          disabled={gpsLoading}
        >
          {gpsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
          Usar mi ubicación actual
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Toca el mapa o busca una dirección para fijar el punto exacto.
      </p>

      <div
        ref={shellRef}
        className={cn(
          "relative z-[1] rounded-xl ring-2 ring-offset-2 ring-offset-background ring-primary/25",
          mapSize === "sm" ? "taxi-leaflet-wrapper taxi-leaflet-wrapper--sm" : "taxi-leaflet-wrapper"
        )}
        style={shellStyle}
      >
        {!ready ? (
          <div
            className={cn(
              "flex h-full w-full items-center justify-center gap-2 rounded-xl border border-border bg-muted/30 text-sm text-muted-foreground",
              placeholderMinH
            )}
          >
            <Loader2 className="h-5 w-5 animate-spin shrink-0" aria-hidden />
            Preparando mapa…
          </div>
        ) : (
          <>
            <MapContainer
              center={marker ? [marker.lat, marker.lon] : DEFAULT_CENTER}
              zoom={marker ? 14 : DEFAULT_ZOOM}
              attributionControl={false}
              className="h-full w-full rounded-xl border border-border z-0"
              style={{
                width: "100%",
                height: "100%",
                minHeight: mapSize === "sm" ? 260 : 400,
              }}
              scrollWheelZoom
              maxZoom={tileMaxZoom}
              {...mapBehavior}
            >
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
              <MapClickPick onPick={onMapPick} />
              {marker && <CenterOnMarker lat={marker.lat} lon={marker.lon} />}
              {marker && (
                <CircleMarker
                  center={[marker.lat, marker.lon]}
                  radius={10}
                  pathOptions={{ color: "#ea580c", fillColor: "#fb923c", fillOpacity: 0.9, weight: 2 }}
                />
              )}
            </MapContainer>
            <GeoapifyMapAttribution />
          </>
        )}
        {(reverseLoading || geoLoading) && (
          <div className="absolute bottom-2 left-2 flex items-center gap-2 rounded-md bg-background/90 border px-2 py-1.5 text-xs shadow">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {reverseLoading ? "Leyendo dirección…" : "Buscando…"}
          </div>
        )}
      </div>
    </div>
  );
}
