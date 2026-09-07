import { useEffect, useMemo, useRef, useState } from "react";
import {
  CircleMarker,
  MapContainer,
  Polyline,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import { Loader2, Pencil, Trash2, X } from "lucide-react";
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
import {
  safeInvalidateSize,
  safeLeafletCamera,
  safeStopLeafletMap,
} from "@/lib/safe-leaflet";
import { cn } from "@/lib/utils";
import type { StoreDeliveryAvoidSegment, StoreLocation } from "@shared/store-schema";
import { STORE_DELIVERY_AVOID_SEGMENTS_MAX } from "@shared/store-schema";
import { StoreDeliveryPerimeterMask } from "@/components/store/StoreDeliveryPerimeterMask";
import { Button } from "@/components/ui/button";

const DEFAULT_CENTER: [number, number] = [-0.22, -78.5];

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

function FitAvoidView({
  branchLocation,
  segments,
  pending,
}: {
  branchLocation: StoreLocation | null;
  segments: StoreDeliveryAvoidSegment[];
  pending: { lat: number; lon: number } | null;
}) {
  const map = useMap();
  const key = useMemo(() => {
    const parts = segments.flatMap((s) => [
      `${s.a.lat.toFixed(5)},${s.a.lon.toFixed(5)}`,
      `${s.b.lat.toFixed(5)},${s.b.lon.toFixed(5)}`,
    ]);
    if (pending) parts.push(`${pending.lat.toFixed(5)},${pending.lon.toFixed(5)}`);
    if (branchLocation) {
      parts.unshift(`${branchLocation.lat.toFixed(5)},${branchLocation.lon.toFixed(5)}`);
    }
    return parts.join("|");
  }, [branchLocation, segments, pending]);

  useEffect(() => {
    let cancelled = false;
    let raf = 0;
    safeLeafletCamera(map, (live) => {
      const pts: L.LatLng[] = [];
      if (branchLocation) pts.push(L.latLng(branchLocation.lat, branchLocation.lon));
      for (const s of segments) {
        pts.push(L.latLng(s.a.lat, s.a.lon), L.latLng(s.b.lat, s.b.lon));
      }
      if (pending) pts.push(L.latLng(pending.lat, pending.lon));
      if (pts.length >= 2) {
        live.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 15, animate: false });
      } else if (pts.length === 1) {
        live.setView(pts[0], 14, { animate: false });
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
  }, [map, key]);

  return null;
}

function segmentLinePositions(s: StoreDeliveryAvoidSegment): [number, number][] {
  if (s.path && s.path.length >= 2) {
    return s.path.map((p) => [p.lat, p.lon] as [number, number]);
  }
  return [
    [s.a.lat, s.a.lon],
    [s.b.lat, s.b.lon],
  ];
}

type StoreDeliveryAvoidSegmentsMapProps = {
  branchLocation: StoreLocation | null;
  perimeterPoints?: Array<{ lat: number; lon: number }> | null;
  segments: StoreDeliveryAvoidSegment[];
  onChange: (segments: StoreDeliveryAvoidSegment[]) => void;
  disabled?: boolean;
  className?: string;
};

function newSegmentId(): string {
  return `avs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

async function snapClickToRoad(
  lat: number,
  lon: number,
): Promise<{ ok: true; point: { lat: number; lon: number } } | { ok: false; message: string }> {
  const res = await fetch(
    `/api/maps/snap-road?lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lon))}`,
  );
  const data = (await res.json().catch(() => null)) as
    | { lat?: number; lon?: number; message?: string }
    | null;
  if (res.status === 404) {
    return {
      ok: false,
      message:
        "El servidor no tiene la ruta de ajuste a calles. Reinicia npm run dev e intenta de nuevo.",
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      message:
        (typeof data?.message === "string" && data.message.trim()) ||
        "Toca más cerca de una calle. Solo se pueden marcar puntos sobre la vía.",
    };
  }
  if (!Number.isFinite(data?.lat) || !Number.isFinite(data?.lon)) {
    return { ok: false, message: "No se pudo ajustar el punto a una calle." };
  }
  return { ok: true, point: { lat: data!.lat!, lon: data!.lon! } };
}

async function matchSegmentOnRoad(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
  keepId?: string,
): Promise<StoreDeliveryAvoidSegment | null> {
  const res = await fetch("/api/maps/match-road-segment", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ a, b }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    a?: { lat: number; lon: number };
    b?: { lat: number; lon: number };
    path?: Array<{ lat: number; lon: number }> | null;
  };
  if (!data.a || !data.b) return null;
  return {
    id: keepId || newSegmentId(),
    a: data.a,
    b: data.b,
    ...(data.path && data.path.length >= 2 ? { path: data.path } : {}),
  };
}

/**
 * Editor de tramos a evitar: dibujar, seleccionar, redibujar o eliminar.
 */
export function StoreDeliveryAvoidSegmentsMap({
  branchLocation,
  perimeterPoints,
  segments,
  onChange,
  disabled,
  className,
}: StoreDeliveryAvoidSegmentsMapProps) {
  useEnsureMapGeolocation();
  const { theme } = useTheme();
  const raster = getTaxiRasterLayerProps(theme === "dark");
  const tileBehavior = getLeafletTileLayerBehaviorProps();
  const mapBehavior = getLeafletMapContainerBehaviorProps();
  const tileMaxZoom = getEffectiveLeafletMaxZoom(raster.maxZoom);
  const { shellRef, ready } = useDeferredLeafletMount({ minShellHeightPx: 64 });
  const [pending, setPending] = useState<{ lat: number; lon: number } | null>(null);
  const [snapping, setSnapping] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** Si está definido, el próximo tramo completo reemplaza este id. */
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const selected = segments.find((s) => s.id === selectedId) ?? null;
  const isRedrawing = replacingId != null;
  const mapRemountKey = branchLocation
    ? `${branchLocation.lat.toFixed(5)},${branchLocation.lon.toFixed(5)}`
    : "no-branch";

  useEffect(() => {
    if (selectedId && !segments.some((s) => s.id === selectedId)) {
      setSelectedId(null);
      if (replacingId === selectedId) {
        setReplacingId(null);
        setPending(null);
      }
    }
  }, [segments, selectedId, replacingId]);

  const center: [number, number] = branchLocation
    ? [branchLocation.lat, branchLocation.lon]
    : segments[0]
      ? [segments[0].a.lat, segments[0].a.lon]
      : DEFAULT_CENTER;

  function clearSelection() {
    setSelectedId(null);
    setReplacingId(null);
    setPending(null);
    setHint(null);
  }

  function selectSegment(id: string) {
    if (disabled || snapping) return;
    setSelectedId(id);
    setReplacingId(null);
    setPending(null);
    setHint(null);
  }

  function startRedraw() {
    if (!selected || disabled) return;
    setReplacingId(selected.id);
    setPending(null);
    setHint("Redibujando: toca dos puntos sobre calles para reemplazar este tramo.");
  }

  function deleteSelected() {
    if (!selected || disabled) return;
    onChange(segments.filter((s) => s.id !== selected.id));
    clearSelection();
  }

  async function onMapPick(lat: number, lon: number) {
    if (disabled || snapping || !aliveRef.current) return;

    // Con tramo seleccionado (sin redibujar), un click en el mapa vacío deselecciona.
    if (selectedId && !isRedrawing && !pending) {
      setSelectedId(null);
      setHint(null);
      return;
    }

    setSnapping(true);
    setHint(null);
    try {
      const snapped = await snapClickToRoad(lat, lon);
      if (!aliveRef.current) return;
      if (!snapped.ok) {
        setHint(snapped.message);
        return;
      }

      if (!pending) {
        setPending(snapped.point);
        return;
      }

      if (!isRedrawing && segments.length >= STORE_DELIVERY_AVOID_SEGMENTS_MAX) {
        setPending(null);
        setHint("Alcanzaste el máximo de tramos a evitar.");
        return;
      }

      if (
        Math.abs(pending.lat - snapped.point.lat) < 1e-6 &&
        Math.abs(pending.lon - snapped.point.lon) < 1e-6
      ) {
        setPending(null);
        return;
      }

      const keepId = replacingId ?? undefined;
      const matched = await matchSegmentOnRoad(pending, snapped.point, keepId);
      if (!aliveRef.current) return;
      const nextSeg: StoreDeliveryAvoidSegment =
        matched ??
        ({
          id: keepId || newSegmentId(),
          a: pending,
          b: snapped.point,
        } satisfies StoreDeliveryAvoidSegment);

      if (replacingId) {
        onChange(segments.map((s) => (s.id === replacingId ? nextSeg : s)));
        setSelectedId(nextSeg.id);
        setReplacingId(null);
      } else {
        onChange([...segments, nextSeg]);
        setSelectedId(nextSeg.id);
      }
      setPending(null);
      setHint(null);
    } catch {
      if (aliveRef.current) {
        setHint("No se pudo ajustar el punto a una calle. Intenta de nuevo.");
      }
    } finally {
      if (aliveRef.current) setSnapping(false);
    }
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div
        ref={shellRef}
        className="relative h-[min(52vh,22rem)] w-full overflow-hidden rounded-2xl border border-border/70 bg-muted/30"
      >
        {ready ? (
          <MapContainer
            key={mapRemountKey}
            center={center}
            zoom={branchLocation || segments.length ? 14 : 7}
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
            <FitAvoidView
              branchLocation={branchLocation}
              segments={segments}
              pending={pending}
            />
            <MapClickPick
              disabled={disabled || snapping}
              onPick={(lat, lon) => void onMapPick(lat, lon)}
            />
            {perimeterPoints && perimeterPoints.length >= 3 ? (
              <StoreDeliveryPerimeterMask points={perimeterPoints} />
            ) : null}
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
            {segments.map((s) => {
              const isSel = s.id === selectedId;
              const line = segmentLinePositions(s);
              return (
                <Polyline
                  key={s.id}
                  positions={line}
                  pathOptions={{
                    color: isSel ? "#f59e0b" : "#ef4444",
                    weight: isSel ? 7 : 5,
                    opacity: 0.95,
                    dashArray: isSel ? undefined : "8 6",
                  }}
                  eventHandlers={{
                    click: (e) => {
                      try {
                        L.DomEvent.stopPropagation(e);
                      } catch {
                        /* mapa desmontándose */
                      }
                      if (!aliveRef.current) return;
                      selectSegment(s.id);
                    },
                  }}
                />
              );
            })}
            {segments.flatMap((s) => {
              const isSel = s.id === selectedId;
              const fill = isSel ? "#f59e0b" : "#ef4444";
              return [
                <CircleMarker
                  key={`${s.id}-a`}
                  center={[s.a.lat, s.a.lon]}
                  radius={isSel ? 6 : 4}
                  pathOptions={{ color: "#fff", weight: 1.5, fillColor: fill, fillOpacity: 1 }}
                  eventHandlers={{
                    click: (e) => {
                      try {
                        L.DomEvent.stopPropagation(e);
                      } catch {
                        /* mapa desmontándose */
                      }
                      if (!aliveRef.current) return;
                      selectSegment(s.id);
                    },
                  }}
                />,
                <CircleMarker
                  key={`${s.id}-b`}
                  center={[s.b.lat, s.b.lon]}
                  radius={isSel ? 6 : 4}
                  pathOptions={{ color: "#fff", weight: 1.5, fillColor: fill, fillOpacity: 1 }}
                  eventHandlers={{
                    click: (e) => {
                      try {
                        L.DomEvent.stopPropagation(e);
                      } catch {
                        /* mapa desmontándose */
                      }
                      if (!aliveRef.current) return;
                      selectSegment(s.id);
                    },
                  }}
                />,
              ];
            })}
            {pending ? (
              <CircleMarker
                center={[pending.lat, pending.lon]}
                radius={6}
                pathOptions={{
                  color: "#fff",
                  weight: 2,
                  fillColor: "#f59e0b",
                  fillOpacity: 1,
                }}
              />
            ) : null}
          </MapContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Cargando mapa…
          </div>
        )}
        {snapping ? (
          <div className="absolute inset-x-0 top-2 z-[500] flex justify-center px-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background/95 px-3 py-1 text-xs shadow-sm">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Ajustando a la calle…
            </span>
          </div>
        ) : null}
      </div>

      {segments.length > 0 ? (
        <div className="max-h-[min(40vh,12rem)] overflow-y-auto overscroll-contain rounded-xl border border-border/60 bg-muted/20 p-2">
          <div className="flex flex-wrap gap-1.5">
            {segments.map((s, index) => {
              const active = s.id === selectedId;
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={disabled || snapping}
                  onClick={() => selectSegment(s.id)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    active
                      ? "border-amber-500/60 bg-amber-500/15 text-amber-700 dark:text-amber-400"
                      : "border-border/70 bg-background/80 text-muted-foreground hover:bg-muted",
                  )}
                >
                  Tramo {index + 1}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {selected ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-full"
            disabled={disabled || snapping}
            onClick={startRedraw}
          >
            <Pencil className="mr-2 h-4 w-4" />
            Redibujar
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-full text-destructive hover:text-destructive"
            disabled={disabled || snapping}
            onClick={deleteSelected}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Eliminar
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-10 rounded-full"
            disabled={disabled || snapping}
            onClick={clearSelection}
          >
            <X className="mr-2 h-4 w-4" />
            {isRedrawing ? "Cancelar redibujo" : "Deseleccionar"}
          </Button>
        </div>
      ) : null}

      {hint ? (
        <p className="text-xs font-medium text-destructive" role="alert">
          {hint}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          {isRedrawing
            ? pending
              ? "Toca el segundo punto sobre una calle para terminar el redibujo."
              : "Toca el primer punto sobre una calle para redibujar el tramo."
            : pending
              ? "Toca el segundo punto sobre una calle para cerrar el tramo."
              : selected
                ? "Tramo seleccionado: puedes redibujarlo o eliminarlo. Toca el mapa vacío para deseleccionar."
                : "Toca dos puntos sobre calles para añadir un tramo, o toca un tramo existente para seleccionarlo."}
          {segments.length > 0 && !selected
            ? ` (${segments.length} tramo${segments.length === 1 ? "" : "s"})`
            : ""}
        </p>
      )}
    </div>
  );
}
