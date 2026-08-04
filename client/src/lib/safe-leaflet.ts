import type { Map as LeafletMap } from "leaflet";

/** Evita errores `_leaflet_pos` / `el is undefined` al desmontar o cambiar móvil ↔ escritorio. */
export function isLeafletMapContainerLive(map: LeafletMap): boolean {
  try {
    const c = map.getContainer();
    return !!c?.isConnected;
  } catch {
    return false;
  }
}

/** Detiene pan/zoom en curso antes de desmontar (evita `_leaflet_pos` mid-animation). */
export function safeStopLeafletMap(map: LeafletMap): void {
  try {
    if (!isLeafletMapContainerLive(map)) return;
    map.stop();
  } catch {
    /* mapa desmontándose */
  }
}

export function safeInvalidateSize(map: LeafletMap, options?: { animate?: boolean }): void {
  try {
    if (!isLeafletMapContainerLive(map)) return;
    map.invalidateSize(options ?? { animate: false });
  } catch {
    /* mapa desmontándose */
  }
}

/** Ejecuta una mutación de cámara solo si el contenedor sigue en el DOM. */
export function safeLeafletCamera(
  map: LeafletMap,
  run: (liveMap: LeafletMap) => void,
): void {
  try {
    if (!isLeafletMapContainerLive(map)) return;
    run(map);
  } catch {
    /* mapa desmontándose */
  }
}
