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

export function safeInvalidateSize(map: LeafletMap, options?: { animate?: boolean }): void {
  try {
    if (!isLeafletMapContainerLive(map)) return;
    map.invalidateSize(options ?? { animate: false });
  } catch {
    /* mapa desmontándose */
  }
}
