import L from "leaflet";

/** Clase base para iconos HTML sin caja blanca por defecto de Leaflet. */
const MARKER_BASE_CLASS = "cargo-leaflet-marker !border-0 !bg-transparent !shadow-none";

/** SVG compactos (vista tipo mapa / pictograma). */
const SVG_MOTO = `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="14" cy="36" r="6" fill="#1e293b"/><circle cx="34" cy="36" r="6" fill="#1e293b"/><path d="M8 28 L18 28 L22 18 L30 18 L34 28 L40 28 L40 32 L6 32 Z" fill="#0ea5e9" stroke="#0369a1" stroke-width="1.5"/><path d="M22 18 L26 10 L30 10 L30 18" fill="none" stroke="#0369a1" stroke-width="2" stroke-linecap="round"/></svg>`;

const SVG_CAR = `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><ellipse cx="24" cy="34" rx="16" ry="5" fill="#1e293b"/><rect x="8" y="22" width="32" height="12" rx="3" fill="#22c55e" stroke="#15803d" stroke-width="1.5"/><rect x="12" y="16" width="24" height="10" rx="2" fill="#bbf7d0" stroke="#15803d" stroke-width="1"/><path d="M14 22 L18 14 L30 14 L34 22" fill="#86efac" stroke="#15803d" stroke-width="1"/></svg>`;

const SVG_PICKUP = `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><ellipse cx="17" cy="36" rx="5" ry="4" fill="#1e293b"/><ellipse cx="36" cy="36" rx="5" ry="4" fill="#1e293b"/><path d="M6 30 L6 24 L22 24 L26 16 L40 16 L42 30 Z" fill="#f97316" stroke="#c2410c" stroke-width="1.5"/><rect x="28" y="18" width="10" height="8" rx="1" fill="#ffedd5" stroke="#c2410c" stroke-width="1"/></svg>`;

const SVG_TRUCK = `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><ellipse cx="14" cy="38" rx="5" ry="4" fill="#1e293b"/><ellipse cx="34" cy="38" rx="5" ry="4" fill="#1e293b"/><ellipse cx="42" cy="38" rx="4" ry="4" fill="#1e293b"/><path d="M4 32 L4 20 L28 20 L28 32 Z" fill="#64748b" stroke="#334155" stroke-width="1.5"/><path d="M28 24 L38 18 L44 24 L44 32 L28 32 Z" fill="#94a3b8" stroke="#334155" stroke-width="1.5"/><rect x="30" y="20" width="10" height="6" rx="1" fill="#e2e8f0"/></svg>`;

const SVG_PERSON = `<svg viewBox="0 0 48 56" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><ellipse cx="24" cy="12" rx="9" ry="10" fill="#0f172a"/><path d="M8 52 C8 38 16 30 24 30 C32 30 40 38 40 52 Z" fill="#0f172a"/><path d="M18 48 L24 38 L30 48" fill="none" stroke="#334155" stroke-width="2" stroke-linecap="round"/></svg>`;

function wrapSvg(inner: string, w: number, h: number): string {
  return `<div class="flex items-end justify-center" style="width:${w}px;height:${h}px">${inner}</div>`;
}

export type CargoVehicleKind = "motorcycle" | "car" | "pickup_truck" | "truck";

export function resolveVehicleKind(vehicleType: string | null | undefined): CargoVehicleKind {
  const t = String(vehicleType ?? "").toLowerCase();
  if (t === "motorcycle") return "motorcycle";
  if (t === "pickup_truck") return "pickup_truck";
  if (t === "truck") return "truck";
  return "car";
}

export function createDriverVehicleIcon(vehicleType: string | null | undefined): L.DivIcon {
  const kind = resolveVehicleKind(vehicleType);
  const inner =
    kind === "motorcycle"
      ? SVG_MOTO
      : kind === "pickup_truck"
        ? SVG_PICKUP
        : kind === "truck"
          ? SVG_TRUCK
          : SVG_CAR;
  const w = 44;
  const h = 44;
  return L.divIcon({
    className: MARKER_BASE_CLASS,
    html: wrapSvg(inner, w, h),
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
