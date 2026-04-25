/**
 * Car Go (taxi): mapas interactivos solo con Leaflet + react-leaflet.
 * Importar este módulo una vez antes de montar componentes que usen `MapContainer`.
 */
import "leaflet/dist/leaflet.css";

/**
 * Carto Voyager: datos OSM con colores equilibrados (zonas verdes, agua, vías) y etiquetas legibles.
 */
export const TAXI_TILE_LAYER_URL =
  "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png";

/** Subdominios del CDN Carto (requerido con `{s}` en la URL). */
export const TAXI_TILE_SUBDOMAINS = "abcd";

export const TAXI_TILE_MAX_ZOOM = 19;

/** Atribución requerida por el proveedor de teselas (esquina del mapa). */
export const TAXI_TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" rel="noreferrer">OpenStreetMap</a> ' +
  '&copy; <a href="https://carto.com/attributions/" rel="noreferrer">CARTO</a>';

/**
 * Nota: Por decisión de producto, ocultamos el control visual de atribución (Leaflet) en la UI.
 * Esto no cambia la fuente de teselas; solo evita que se muestre el texto bajo el mapa.
 *
 * Se aplica con `attributionControl={false}` en los MapContainer.
 */
