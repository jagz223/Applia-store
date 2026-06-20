import type { Map as LeafletMap } from "leaflet";
import { isLeafletMobileMap } from "@/components/taxi/leaflet-config";

export function normalizeMapBearing(d: number): number {
  return ((Math.round(d * 10) / 10) % 360 + 360) % 360;
}

/** Delta más corto entre dos ángulos (p. ej. 350° → 10° = +20, no −340). */
export function shortestBearingDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

/** Suavizado exponencial independiente del framerate. */
function bearingStiffness(): number {
  return isLeafletMobileMap() ? 13.5 : 10.5;
}

const BEARING_SNAP_DEG = 0.06;

/**
 * Intercepta `setBearing` para interpolar suavemente (gesto táctil, botones y reset).
 * Devuelve función de restauración al desmontar el mapa.
 */
export function installLeafletBearingSmoother(map: LeafletMap): () => void {
  if (typeof map.setBearing !== "function") return () => {};

  const original = map.setBearing.bind(map);
  let target = normalizeMapBearing(map.getBearing?.() ?? 0);
  let display = target;
  let raf = 0;
  let lastTs = performance.now();

  const tick = (now: number) => {
    const dt = Math.min(0.05, (now - lastTs) / 1000);
    lastTs = now;
    const delta = shortestBearingDelta(display, target);

    if (Math.abs(delta) <= BEARING_SNAP_DEG) {
      if (display !== target) {
        display = target;
        original(display);
      }
      raf = 0;
      return;
    }

    const factor = 1 - Math.exp(-bearingStiffness() * dt);
    display = normalizeMapBearing(display + delta * factor);
    original(display);
    raf = requestAnimationFrame(tick);
  };

  const schedule = () => {
    if (raf) return;
    lastTs = performance.now();
    raf = requestAnimationFrame(tick);
  };

  map.setBearing = function patchedSetBearing(theta: number) {
    target = normalizeMapBearing(theta);
    schedule();
    return map;
  };

  return () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    map.setBearing = original;
  };
}

/** Zoom +/- con transición flyTo más suave que el salto por defecto. */
export function installLeafletZoomEasing(map: LeafletMap): () => void {
  const fly = {
    animate: true as const,
    duration: isLeafletMobileMap() ? 0.34 : 0.42,
    easeLinearity: 0.22,
  };

  const originalZoomIn = map.zoomIn.bind(map);
  const originalZoomOut = map.zoomOut.bind(map);

  map.zoomIn = (options?) => {
    const step = options?.delta ?? 1;
    const next = Math.min(map.getMaxZoom(), map.getZoom() + step);
    if (next === map.getZoom()) return map;
    map.flyTo(map.getCenter(), next, fly);
    return map;
  };

  map.zoomOut = (options?) => {
    const step = options?.delta ?? 1;
    const next = Math.max(map.getMinZoom(), map.getZoom() - step);
    if (next === map.getZoom()) return map;
    map.flyTo(map.getCenter(), next, fly);
    return map;
  };

  return () => {
    map.zoomIn = originalZoomIn;
    map.zoomOut = originalZoomOut;
  };
}

export function installLeafletMapMotionEnhancements(map: LeafletMap): () => void {
  const restoreBearing = installLeafletBearingSmoother(map);
  const restoreZoom = installLeafletZoomEasing(map);
  return () => {
    restoreBearing();
    restoreZoom();
  };
}
