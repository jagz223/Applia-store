/**
 * Car Go (taxi): mapas interactivos solo con Leaflet + react-leaflet.
 * Importar este módulo una vez antes de montar componentes que usen `MapContainer`.
 */
import "leaflet/dist/leaflet.css";
import L from "leaflet";

const geoapifyKey = String(import.meta.env.VITE_GEOAPIFY_API_KEY ?? "").trim();

/** Modo claro: Carto Voyager (reserva si no hay `VITE_GEOAPIFY_API_KEY`). */
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

/** Atribución Carto Voyager (modo claro / oscuro Carto). */
export const TAXI_TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" rel="noreferrer">OpenStreetMap</a> ' +
  '&copy; <a href="https://carto.com/attributions/" rel="noreferrer">CARTO</a>';

/** Atribución requerida por Geoapify (estilos basados en OpenMapTiles salvo osm-carto). */
export const TAXI_TILE_ATTRIBUTION_GEOAPIFY =
  'Powered by <a href="https://www.geoapify.com/" target="_blank" rel="noreferrer">Geoapify</a> | ' +
  '<a href="https://openmaptiles.org/" target="_blank" rel="noreferrer">© OpenMapTiles</a> ' +
  '<a href="https://www.openstreetmap.org/copyright" rel="noreferrer">© OpenStreetMap</a> contributors';

export const TAXI_TILE_MAX_ZOOM_GEOAPIFY = 20;

/** `true` cuando el cliente usa teselas Geoapify (atribución visible según plan / contrato). */
export function usesGeoapifyTiles(): boolean {
  return Boolean(geoapifyKey);
}

/**
 * Mostrar la franja de atribución en mapas con teselas Geoapify.
 * Si tienes contrato / plan con **white label** y no debes mostrar la marca, define
 * `VITE_GEOAPIFY_WHITE_LABEL=true` (el mapa sigue usando Geoapify; solo se oculta esta capa).
 */
export function showGeoapifyMapAttribution(): boolean {
  if (!geoapifyKey) return false;
  const wl = String(import.meta.env.VITE_GEOAPIFY_WHITE_LABEL ?? "").trim().toLowerCase();
  return !(wl === "1" || wl === "true" || wl === "yes");
}

/**
 * URL/attribution/maxZoom/subdomains/apiKey según tema.
 * Con `VITE_GEOAPIFY_API_KEY`: teselas Geoapify (claro osm-bright, oscuro dark-matter).
 * Sin clave: reserva Carto (desarrollo sin variable).
 */
export function getTaxiRasterLayerProps(isDarkMode: boolean): {
  url: string;
  attribution: string;
  maxZoom: number;
  /** Carto Voyager y Dark Matter usan `{s}` en la plantilla */
  subdomains?: string;
  /** Sustitución Leaflet para `?apiKey={apiKey}` en URLs Geoapify */
  apiKey?: string;
} {
  if (geoapifyKey) {
    const retina = L.Browser.retina;
    const style = isDarkMode ? "dark-matter" : "osm-bright";
    const url = retina
      ? `https://maps.geoapify.com/v1/tile/${style}/{z}/{x}/{y}@2x.png?apiKey={apiKey}`
      : `https://maps.geoapify.com/v1/tile/${style}/{z}/{x}/{y}.png?apiKey={apiKey}`;
    return {
      url,
      attribution: TAXI_TILE_ATTRIBUTION_GEOAPIFY,
      maxZoom: TAXI_TILE_MAX_ZOOM_GEOAPIFY,
      apiKey: geoapifyKey,
    };
  }

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
 * Nota: el control nativo de Leaflet sigue desactivado (`attributionControl={false}`).
 * Con teselas Geoapify se muestra además `GeoapifyMapAttribution` (esquina inferior).
 * En planes con opción «white label» de Geoapify la marca puede no ser obligatoria; consulta tu contrato.
 */
