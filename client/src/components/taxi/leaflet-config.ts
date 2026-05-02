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

/** Stadia Maps Alidade Smooth Dark (oscuro pero más legible que Carto Dark Matter). Incluye `{r}` retina (Leaflet). */
export const TAXI_TILE_LAYER_URL_STADIA_DARK =
  "https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png";

export const TAXI_TILE_MAX_ZOOM_STADIA_DARK = 20;

/** Atribución Carto Voyager (modo claro). */
export const TAXI_TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" rel="noreferrer">OpenStreetMap</a> ' +
  '&copy; <a href="https://carto.com/attributions/" rel="noreferrer">CARTO</a>';

/** Atribución Stadia (modo oscuro — Alidade Smooth Dark). */
export const TAXI_TILE_ATTRIBUTION_STADIA_DARK =
  '&copy; <a href="https://stadiamaps.com/" rel="noreferrer">Stadia Maps</a> ' +
  '&copy; <a href="https://openmaptiles.org/" rel="noreferrer">OpenMapTiles</a> ' +
  '&copy; <a href="https://www.openstreetmap.org/copyright" rel="noreferrer">OpenStreetMap</a>';

/**
 * URL/attribution/maxZoom/subdomains según tema.
 * Producción fuera de localhost: registrar dominio en Stadia o usar API key (ver docs.stadiamaps.com/raster).
 */
export function getTaxiRasterLayerProps(isDarkMode: boolean): {
  url: string;
  attribution: string;
  maxZoom: number;
  /** Solo Carto Voyager lleva `{s}` en la plantilla */
  subdomains?: string;
} {
  if (isDarkMode) {
    return {
      url: TAXI_TILE_LAYER_URL_STADIA_DARK,
      attribution: TAXI_TILE_ATTRIBUTION_STADIA_DARK,
      maxZoom: TAXI_TILE_MAX_ZOOM_STADIA_DARK,
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
