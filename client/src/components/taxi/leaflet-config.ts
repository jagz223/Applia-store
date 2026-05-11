/**
 * Car Go (taxi): mapas interactivos solo con Leaflet + react-leaflet.
 * Importar este módulo una vez antes de montar componentes que usen `MapContainer`.
 */
import "leaflet/dist/leaflet.css";

/** Modo claro: Carto Voyager. */
export const TAXI_TILE_LAYER_URL =
  "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png";

/** Subdominios del CDN Carto (requerido con `{s}` en la URL Voyager). */
export const TAXI_TILE_SUBDOMAINS = "abcd";

/** Carto Voyager — zoom máximo razonable. */
export const TAXI_TILE_MAX_ZOOM = 19;

/**
 * Modo oscuro: Carto Dark Matter (mismo CDN y patrón `{s}` que Voyager).
 * Importante: no usar Stadia en producción sin API key — devuelve 401 en dominios reales
 * (solo suele “funcionar” en local si el proveedor aplica reglas distintas).
 */
export const TAXI_TILE_LAYER_URL_DARK =
  "https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png";

/** Atribución Carto Voyager (modo claro). */
export const TAXI_TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" rel="noreferrer">OpenStreetMap</a> ' +
  '&copy; <a href="https://carto.com/attributions/" rel="noreferrer">CARTO</a>';

/**
 * URL/attribution/maxZoom/subdomains según tema.
 * Claro y oscuro usan Carto CDN (sin clave), comportamiento estable en local, staging y producción.
 */
export function getTaxiRasterLayerProps(isDarkMode: boolean): {
  url: string;
  attribution: string;
  maxZoom: number;
  /** Carto Voyager y Dark Matter usan `{s}` en la plantilla */
  subdomains?: string;
} {
  if (isDarkMode) {
    return {
      url: TAXI_TILE_LAYER_URL_DARK,
      attribution: TAXI_TILE_ATTRIBUTION,
      maxZoom: TAXI_TILE_MAX_ZOOM,
      subdomains: TAXI_TILE_SUBDOMAINS,
    };
  }
  return {
    url: TAXI_TILE_LAYER_URL,
    attribution: TAXI_TILE_ATTRIBUTION,
    maxZoom: TAXI_TILE_MAX_ZOOM,
    subdomains: TAXI_TILE_SUBDOMAINS,
  };
}

/**
 * Nota: Por decisión de producto, ocultamos el control visual de atribución (Leaflet) en la UI.
 * Esto no cambia la fuente de teselas; solo evita que se muestre el texto bajo el mapa.
 *
 * Se aplica con `attributionControl={false}` en los MapContainer.
 */
