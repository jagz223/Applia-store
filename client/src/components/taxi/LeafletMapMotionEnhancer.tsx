import { useEffect, useRef } from "react";
import { useMap, useMapEvents } from "react-leaflet";
import { installLeafletMapMotionEnhancements, normalizeMapBearing } from "@/lib/leaflet-map-rotate";

export { normalizeMapBearing };

/** Suavizado de giro + zoom; sincroniza bearing con React. */
export function LeafletMapMotionEnhancer({
  bearingDeg,
  onBearingChange,
}: {
  bearingDeg: number;
  onBearingChange: (n: number) => void;
}) {
  const map = useMap();
  const onBearingChangeRef = useRef(onBearingChange);
  onBearingChangeRef.current = onBearingChange;
  const syncingRef = useRef(false);

  useEffect(() => {
    const restore = installLeafletMapMotionEnhancements(map);
    return restore;
  }, [map]);

  useEffect(() => {
    if (typeof map.setBearing !== "function") return;
    const current = normalizeMapBearing(map.getBearing?.() ?? 0);
    const target = normalizeMapBearing(bearingDeg);
    if (current === target) return;
    syncingRef.current = true;
    map.setBearing(target);
    syncingRef.current = false;
  }, [map, bearingDeg]);

  useMapEvents({
    rotate: () => {
      if (syncingRef.current || typeof map.getBearing !== "function") return;
      onBearingChangeRef.current(normalizeMapBearing(map.getBearing()));
    },
  });

  return null;
}

/** @deprecated Usar LeafletMapMotionEnhancer */
export const LeafletRotateSync = LeafletMapMotionEnhancer;
