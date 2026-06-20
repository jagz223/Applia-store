import type { ReactNode } from "react";
import { useEffect, useMemo, useRef } from "react";
import { Marker, useMap } from "react-leaflet";
import type { Marker as LeafletMarker } from "leaflet";
import { createDriverVehicleIcon } from "@/components/driver/cargo-map-markers";
import type { FleetWorkAccent } from "@/lib/central-fleet-work-accent";

type Props = {
  position: [number, number];
  vehicleType: string | null | undefined;
  /** Grados geográficos (0 = norte). Solo aplicar en servicio activo. */
  headingDeg?: number | null;
  rotateWithHeading?: boolean;
  markerColor?: string;
  workAccent?: FleetWorkAccent;
  stale?: boolean;
  entering?: boolean;
  sizePx?: number;
  interactive?: boolean;
  zIndexOffset?: number;
  onClick?: () => void;
  children?: ReactNode;
};

/** Marcador de vehículo con icono PNG y rotación respecto al mapa. */
export function VehicleMapMarker({
  position,
  vehicleType,
  headingDeg = null,
  rotateWithHeading = false,
  markerColor,
  workAccent,
  stale,
  entering,
  sizePx,
  interactive = true,
  zIndexOffset = 600,
  onClick,
  children,
}: Props) {
  const map = useMap();
  const markerRef = useRef<LeafletMarker | null>(null);
  const mapBearingRef = useRef(0);

  const icon = useMemo(
    () =>
      createDriverVehicleIcon(vehicleType, {
        entering,
        stale,
        sizePx,
        workAccent,
        markerColor,
      }),
    [vehicleType, entering, stale, sizePx, workAccent, markerColor],
  );

  useEffect(() => {
    const syncMapBearing = () => {
      mapBearingRef.current = typeof map.getBearing === "function" ? map.getBearing() : 0;
      applyRotation();
    };
    const applyRotation = () => {
      const el = markerRef.current?.getElement()?.querySelector(".vehicle-marker-inner") as HTMLElement | null;
      if (!el) return;
      if (!rotateWithHeading || headingDeg == null) {
        el.style.transform = "rotate(0deg)";
        return;
      }
      const screenDeg = headingDeg - mapBearingRef.current;
      el.style.transform = `rotate(${screenDeg}deg)`;
    };

    syncMapBearing();
    map.on("rotate", syncMapBearing);
    return () => {
      map.off("rotate", syncMapBearing);
    };
  }, [map, headingDeg, rotateWithHeading]);

  useEffect(() => {
    const el = markerRef.current?.getElement()?.querySelector(".vehicle-marker-inner") as HTMLElement | null;
    if (!el) return;
    if (!rotateWithHeading || headingDeg == null) {
      el.style.transform = "rotate(0deg)";
      return;
    }
    const screenDeg = headingDeg - mapBearingRef.current;
    el.style.transform = `rotate(${screenDeg}deg)`;
  }, [headingDeg, rotateWithHeading, icon]);

  return (
    <Marker
      ref={markerRef}
      position={position}
      icon={icon}
      interactive={interactive}
      zIndexOffset={zIndexOffset}
      eventHandlers={onClick ? { click: onClick } : undefined}
    >
      {children}
    </Marker>
  );
}
