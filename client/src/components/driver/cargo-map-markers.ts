import L from "leaflet";
import type { FleetWorkAccent } from "@/lib/central-fleet-work-accent";

/** Clase base para iconos HTML sin caja blanca por defecto de Leaflet. */
const MARKER_BASE_CLASS = "cargo-leaflet-marker !border-0 !bg-transparent !shadow-none";

/**
 * Pictogramas laterales para mapa: capas + contraste para modo oscuro en tiles.
 * Sin `<defs>` con ids globales (varios marcadores en el mismo mapa).
 */
const SVG_MOTO = `<svg viewBox="0 0 56 56" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <ellipse cx="28" cy="47" rx="22" ry="3.5" fill="rgba(15,23,42,0.35)"/>
  <circle cx="14" cy="38" r="7.5" fill="#0f172a"/><circle cx="14" cy="38" r="4.5" fill="#334155" opacity="0.85"/>
  <circle cx="40" cy="38" r="7.5" fill="#0f172a"/><circle cx="40" cy="38" r="4.5" fill="#334155" opacity="0.85"/>
  <path d="M8 34 L8 30 L18 30 L22 22 L34 22 L38 30 L48 30 L48 34 Z" fill="#0369a1"/>
  <path d="M10 30 L20 30 L24 22 L34 22 L36 30 Z" fill="#0ea5e9"/>
  <path d="M24 22 L28 14 L36 14 L34 22 Z" fill="#38bdf8" opacity="0.95"/>
  <path d="M26 14 L30 10 L36 10 L36 14" fill="none" stroke="#e0f2fe" stroke-width="1.6" stroke-linecap="round" opacity="0.9"/>
  <path d="M18 30 L22 24 L32 24 L34 30" fill="none" stroke="#075985" stroke-width="1.2" opacity="0.6"/>
</svg>`;

const SVG_CAR = `<svg viewBox="0 0 56 56" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <ellipse cx="28" cy="47" rx="23" ry="3.5" fill="rgba(15,23,42,0.35)"/>
  <ellipse cx="15" cy="39" rx="6.5" ry="5" fill="#0f172a"/><circle cx="15" cy="39" r="3.2" fill="#475569"/>
  <ellipse cx="41" cy="39" rx="6.5" ry="5" fill="#0f172a"/><circle cx="41" cy="39" r="3.2" fill="#475569"/>
  <path d="M8 34 L10 26 L18 18 L38 18 L46 26 L48 34 L48 38 L8 38 Z" fill="#047857"/>
  <path d="M12 34 L14 28 L20 22 L36 22 L42 28 L44 34 Z" fill="#10b981"/>
  <path d="M14 28 L18 20 L38 20 L42 28 Z" fill="#6ee7b7" opacity="0.85"/>
  <path d="M18 20 L22 14 L34 14 L38 20 Z" fill="#a7f3d0" opacity="0.75"/>
  <path d="M12 34 L44 34" stroke="#065f46" stroke-width="1" opacity="0.35"/>
</svg>`;

const SVG_PICKUP = `<svg viewBox="0 0 56 56" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <ellipse cx="28" cy="47" rx="24" ry="3.5" fill="rgba(15,23,42,0.35)"/>
  <ellipse cx="16" cy="39" rx="6" ry="4.8" fill="#0f172a"/><circle cx="16" cy="39" r="3" fill="#475569"/>
  <ellipse cx="40" cy="39" rx="6" ry="4.8" fill="#0f172a"/><circle cx="40" cy="39" r="3" fill="#475569"/>
  <path d="M6 36 L6 28 L22 28 L26 20 L48 20 L50 36 Z" fill="#c2410c"/>
  <path d="M8 36 L10 30 L24 30 L28 22 L46 22 L48 36 Z" fill="#fb923c"/>
  <rect x="30" y="23" width="14" height="10" rx="1.5" fill="#ffedd5" stroke="#9a3412" stroke-width="1"/>
  <path d="M26 20 L30 14 L42 14 L46 22" fill="#fdba74" opacity="0.9"/>
</svg>`;

const SVG_TRUCK = `<svg viewBox="0 0 56 56" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <ellipse cx="28" cy="47" rx="24" ry="3.5" fill="rgba(15,23,42,0.35)"/>
  <ellipse cx="13" cy="40" rx="5.5" ry="4.5" fill="#0f172a"/><circle cx="13" cy="40" r="2.8" fill="#475569"/>
  <ellipse cx="28" cy="40" rx="5.5" ry="4.5" fill="#0f172a"/><circle cx="28" cy="40" r="2.8" fill="#475569"/>
  <ellipse cx="43" cy="40" rx="5" ry="4.5" fill="#0f172a"/><circle cx="43" cy="40" r="2.6" fill="#475569"/>
  <path d="M4 38 L4 22 L30 22 L30 38 Z" fill="#475569" stroke="#1e293b" stroke-width="1.2"/>
  <path d="M30 26 L44 18 L50 26 L50 38 L30 38 Z" fill="#64748b" stroke="#334155" stroke-width="1.2"/>
  <rect x="8" y="26" width="18" height="10" rx="1" fill="#94a3b8" opacity="0.5"/>
  <rect x="34" y="22" width="12" height="8" rx="1" fill="#e2e8f0"/>
</svg>`;

const SVG_PERSON = `<svg viewBox="0 0 48 56" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><ellipse cx="24" cy="12" rx="9" ry="10" fill="#0f172a"/><path d="M8 52 C8 38 16 30 24 30 C32 30 40 38 40 52 Z" fill="#0f172a"/><path d="M18 48 L24 38 L30 48" fill="none" stroke="#334155" stroke-width="2" stroke-linecap="round"/></svg>`;

export type CargoVehicleKind = "motorcycle" | "car" | "pickup_truck" | "truck";

const WORK_ACCENT_COLOR: Record<Exclude<FleetWorkAccent, null>, string> = {
  taxi: "#0ea5e9",
  delivery: "#8b5cf6",
  both: "#10b981",
};

type VehicleShadeKey = "dark" | "base" | "light" | "highlight" | "stroke" | "strokeLight";

const VEHICLE_TINT_MAPS: Record<CargoVehicleKind, readonly (readonly [string, VehicleShadeKey])[]> = {
  motorcycle: [
    ["#0369a1", "dark"],
    ["#0ea5e9", "base"],
    ["#38bdf8", "light"],
    ["#075985", "stroke"],
    ["#e0f2fe", "strokeLight"],
  ],
  car: [
    ["#047857", "dark"],
    ["#10b981", "base"],
    ["#6ee7b7", "light"],
    ["#a7f3d0", "highlight"],
    ["#065f46", "stroke"],
  ],
  pickup_truck: [
    ["#c2410c", "dark"],
    ["#fb923c", "base"],
    ["#fdba74", "light"],
    ["#ffedd5", "highlight"],
    ["#9a3412", "stroke"],
  ],
  truck: [
    ["#475569", "dark"],
    ["#64748b", "base"],
    ["#94a3b8", "light"],
    ["#e2e8f0", "highlight"],
    ["#334155", "stroke"],
    ["#1e293b", "stroke"],
  ],
};

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace("#", "");
  const expanded =
    normalized.length === 3
      ? normalized
          .split("")
          .map((c) => c + c)
          .join("")
      : normalized;
  const n = Number.parseInt(expanded, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b]
    .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"))
    .join("")}`;
}

function mixHex(from: string, to: string, amount: number): string {
  const [fr, fg, fb] = hexToRgb(from);
  const [tr, tg, tb] = hexToRgb(to);
  const t = Math.max(0, Math.min(1, amount));
  return rgbToHex(fr + (tr - fr) * t, fg + (tg - fg) * t, fb + (tb - fb) * t);
}

function markerColorShades(base: string): Record<VehicleShadeKey, string> {
  return {
    dark: mixHex(base, "#000000", 0.38),
    base,
    light: mixHex(base, "#ffffff", 0.32),
    highlight: mixHex(base, "#ffffff", 0.52),
    stroke: mixHex(base, "#000000", 0.55),
    strokeLight: mixHex(base, "#ffffff", 0.62),
  };
}

/** Sustituye los tonos de carrocería del pictograma por una paleta derivada del color del conductor. */
function tintVehicleSvg(svg: string, kind: CargoVehicleKind, markerColor: string): string {
  const shades = markerColorShades(markerColor.trim());
  let out = svg;
  for (const [original, key] of VEHICLE_TINT_MAPS[kind]) {
    out = out.split(original).join(shades[key]);
  }
  return out;
}

function wrapSvg(
  inner: string,
  w: number,
  h: number,
  opts?: { stale?: boolean; workAccent?: FleetWorkAccent },
): string {
  const stale = !!opts?.stale;
  const shadow = "filter:drop-shadow(0 2px 6px rgba(0,0,0,0.5)) drop-shadow(0 1px 1px rgba(0,0,0,0.35))";
  const staleFx = stale ? "opacity:0.55;filter:saturate(0.65) drop-shadow(0 2px 6px rgba(0,0,0,0.35));" : shadow;
  const accent = opts?.workAccent;
  const badge =
    accent != null
      ? `<span aria-hidden="true" style="position:absolute;top:2px;right:2px;width:11px;height:11px;border-radius:9999px;background:${WORK_ACCENT_COLOR[accent]};border:2px solid #fff;box-shadow:0 0 0 1px rgba(15,23,42,0.35);z-index:3;"></span>`
      : "";
  return `<div class="relative flex items-end justify-center" style="width:${w}px;height:${h}px;${staleFx}"><div style="position:relative;z-index:1;width:100%;height:100%;">${inner}</div>${badge}</div>`;
}

export function resolveVehicleKind(vehicleType: string | null | undefined): CargoVehicleKind {
  const t = String(vehicleType ?? "").toLowerCase().trim();
  if (t === "motorcycle" || t === "moto") return "motorcycle";
  if (t === "pickup_truck" || t === "camioneta") return "pickup_truck";
  if (t === "truck") return "truck";
  return "car";
}

export function createDriverVehicleIcon(
  vehicleType: string | null | undefined,
  options?: {
    entering?: boolean;
    stale?: boolean;
    sizePx?: number;
    workAccent?: FleetWorkAccent;
    /** Tinte de carrocería por conductor (mapa de central). */
    markerColor?: string;
  },
): L.DivIcon {
  const kind = resolveVehicleKind(vehicleType);
  const baseInner =
    kind === "motorcycle"
      ? SVG_MOTO
      : kind === "pickup_truck"
        ? SVG_PICKUP
        : kind === "truck"
          ? SVG_TRUCK
          : SVG_CAR;
  const markerColor = options?.markerColor?.trim();
  const inner =
    markerColor != null && markerColor.length > 0
      ? tintVehicleSvg(baseInner, kind, markerColor)
      : baseInner;
  const w = Math.max(16, Math.round(options?.sizePx ?? 48));
  const h = w;
  const enterClass = options?.entering ? " fleet-marker-enter" : "";
  return L.divIcon({
    className: MARKER_BASE_CLASS + enterClass,
    html: wrapSvg(inner, w, h, {
      stale: options?.stale,
      workAccent: options?.workAccent,
    }),
    iconSize: [w, h],
    iconAnchor: [w / 2, h],
    popupAnchor: [0, -h],
  });
}

/** Pasajero / solicitud de servicio (silueta). */
export function createRiderRequestIcon(): L.DivIcon {
  const w = 40;
  const h = 52;
  return L.divIcon({
    className: MARKER_BASE_CLASS,
    html: wrapSvg(SVG_PERSON, w, h),
    iconSize: [w, h],
    iconAnchor: [w / 2, h],
    popupAnchor: [0, -h],
  });
}
