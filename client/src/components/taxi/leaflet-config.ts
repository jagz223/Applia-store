/**
 * Car Go (taxi): mapas interactivos solo con Leaflet + react-leaflet.
 * Importar este módulo una vez antes de montar componentes que usen `MapContainer`.
 */
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import type { MapOptions } from "leaflet";

declare global {
  interface Window {
    L?: typeof L;
  }
}

if (typeof window !== "undefined") {
  window.L = L;
}

import "leaflet-rotate/dist/leaflet-rotate.js";

const geoapifyKey = String(import.meta.env.VITE_GEOAPIFY_API_KEY ?? "").trim();

/** Móvil / pantalla táctil: menos animación y teselas más ligeras. */
export function isLeafletMobileMap(): boolean {
  if (typeof window === "undefined") return false;
  if (L.Browser.mobile) return true;
  try {
    return window.matchMedia("(pointer: coarse)").matches;
  } catch {
    return false;
  }
}

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
    // @2x en móvil duplica peso de red y agrava “cuadros blancos” al hacer zoom.
    const retina = L.Browser.retina && !isLeafletMobileMap();
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

/** Zoom máximo efectivo (menos teselas en móvil). */
export function getEffectiveLeafletMaxZoom(maxZoom: number): number {
  const cap = isLeafletMobileMap() ? 18 : maxZoom;
  return Math.min(maxZoom, cap);
}

/**
 * Animaciones del mapa: zoom suave y marcadores; teselas con fade sutil.
 * El pinch en móvil usa `_animateZoom` al soltar; +/- pasa por `flyTo` en `LeafletMapMotionEnhancer`.
 */
export function getLeafletMapContainerBehaviorProps(): Pick<
  MapOptions,
  "fadeAnimation" | "zoomAnimation" | "zoomAnimationThreshold" | "markerZoomAnimation"
> {
  return {
    fadeAnimation: true,
    zoomAnimation: true,
    zoomAnimationThreshold: 4,
    markerZoomAnimation: true,
  };
}

/** Reduce parpadeos / “cuadros blancos” al pan/zoom o redimensionar. */
export function getLeafletTileLayerBehaviorProps(): {
  updateWhenIdle: boolean;
  updateWhenZooming: boolean;
  keepBuffer: number;
} {
  const mobile = isLeafletMobileMap();
  return {
    updateWhenIdle: true,
    updateWhenZooming: true,
    keepBuffer: mobile ? 4 : 5,
  };
}

/** Escritorio con puntero fino (controles de giro con botones). */
export function isLeafletDesktopMap(): boolean {
  return !isLeafletMobileMap();
}

/**
 * Rotación nativa (plugin leaflet-rotate):
 * - Móvil: dos dedos para girar (`touchRotate`).
 * - Escritorio: botones en UI (`MapRotateControls`); sin shift+rueda.
 */
export function getLeafletRotateMapOptions(): Pick<
  MapOptions,
  "rotate" | "bearing" | "touchRotate" | "shiftKeyRotate" | "rotateControl"
> {
  const mobile = isLeafletMobileMap();
  return {
    rotate: true,
    bearing: 0,
    touchRotate: mobile,
    shiftKeyRotate: false,
    rotateControl: false,
  };
}

/**
 * Nota: el control nativo de Leaflet sigue desactivado (`attributionControl={false}`).
 * Con teselas Geoapify se muestra además `GeoapifyMapAttribution` (esquina inferior).
 * En planes con opción «white label» de Geoapify la marca puede no ser obligatoria; consulta tu contrato.
 */
