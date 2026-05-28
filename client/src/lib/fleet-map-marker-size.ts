/** Tamaño base del icono de vehículo en el mapa de flota (px). */
export const FLEET_MARKER_BASE_SIZE_PX = 48;

/** Zoom de referencia: a este nivel el icono usa el tamaño base. */
export const FLEET_MARKER_REF_ZOOM = 13;

const MIN_PX = 20;
const MAX_PX = 52;

/** A mayor zoom (más cerca), iconos más pequeños para reducir solapamiento en calles. */
export function fleetMarkerSizeForZoom(zoom: number): number {
  const factor = Math.pow(0.86, zoom - FLEET_MARKER_REF_ZOOM);
  return Math.round(Math.min(MAX_PX, Math.max(MIN_PX, FLEET_MARKER_BASE_SIZE_PX * factor)));
}
