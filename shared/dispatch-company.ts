import type { GoVehicleType } from "./mobility-fare-quote";

/** Tarifa por central: precio por km y piso mínimo (sin sumar base al aplicar el mínimo). */
export type DispatchFareTier = {
  perKmUsd: number;
  minUsd: number;
};

export type DispatchMobilityFares = {
  moto: DispatchFareTier;
  auto: DispatchFareTier & { petExtraUsd: number };
  camioneta: DispatchFareTier & { petExtraUsd: number };
  pet_car: DispatchFareTier;
};

export type DispatchPackFares = {
  moto: DispatchFareTier;
  auto: DispatchFareTier;
  camioneta: DispatchFareTier;
};

export const DEFAULT_DISPATCH_MOBILITY_FARES: DispatchMobilityFares = {
  moto: { perKmUsd: 0.5, minUsd: 2 },
  auto: { perKmUsd: 0.85, minUsd: 2.5, petExtraUsd: 1 },
  camioneta: { perKmUsd: 1.25, minUsd: 15, petExtraUsd: 2 },
  pet_car: { perKmUsd: 0.85, minUsd: 3 },
};

export const DEFAULT_DISPATCH_PACK_FARES: DispatchPackFares = {
  moto: { perKmUsd: 0.5, minUsd: 2 },
  auto: { perKmUsd: 0.85, minUsd: 2.5 },
  camioneta: { perKmUsd: 1.25, minUsd: 15 },
};

/** Centro por defecto del mapa de panel central (área metropolitana Quito). */
export const DEFAULT_CENTRAL_SERVICE_MAP = {
  lat: -0.1807,
  lon: -78.4678,
  /** Zoom amplio para ver la ciudad; no GPS del operador. */
  cityZoom: 11,
} as const;

export type CentralServiceMapView = {
  lat: number;
  lon: number;
  cityZoom: number;
};

/** Resuelve centro/zoom del mapa de central (Firestore puede tener valores personalizados). */
export function resolveCentralServiceMapView(
  company: Partial<{
    serviceMapLat: number | null | undefined;
    serviceMapLon: number | null | undefined;
    serviceMapCityZoom: number | null | undefined;
  }> | null | undefined,
): CentralServiceMapView {
  const d = DEFAULT_CENTRAL_SERVICE_MAP;
  const lat = typeof company?.serviceMapLat === "number" && Number.isFinite(company.serviceMapLat)
    ? company.serviceMapLat
    : d.lat;
  const lon = typeof company?.serviceMapLon === "number" && Number.isFinite(company.serviceMapLon)
    ? company.serviceMapLon
    : d.lon;
  const cityZoom =
    typeof company?.serviceMapCityZoom === "number" &&
    Number.isFinite(company.serviceMapCityZoom) &&
    company.serviceMapCityZoom >= 9 &&
    company.serviceMapCityZoom <= 14
      ? company.serviceMapCityZoom
      : d.cityZoom;
  return { lat, lon, cityZoom };
}

export type DispatchCompany = {
  id: string;
  name: string;
  ownerUserId: string;
  isActive: boolean;
  mobilityFares: DispatchMobilityFares;
  packFares: DispatchPackFares;
  createdAt: string;
  updatedAt: string;
  /** Centro de la ciudad de operación en el mapa del panel central (opcional). */
  serviceMapLat?: number | null;
  serviceMapLon?: number | null;
  serviceMapCityZoom?: number | null;
};

export const DISPATCH_COMPANY_NONE = "__none__";

export function isDispatchCompanyNone(value: string | null | undefined): boolean {
  return value == null || value === "" || value === DISPATCH_COMPANY_NONE;
}

export function normalizeDispatchCompanyId(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s || s === DISPATCH_COMPANY_NONE) return null;
  return s;
}

export function vehicleTypeForDispatchMobility(vt: GoVehicleType): keyof DispatchMobilityFares {
  if (vt === "pet_car") return "pet_car";
  if (vt === "camioneta") return "camioneta";
  if (vt === "moto") return "moto";
  return "auto";
}

export function vehicleTypeForDispatchPack(
  vt: GoVehicleType,
): keyof DispatchPackFares {
  if (vt === "camioneta") return "camioneta";
  if (vt === "moto") return "moto";
  return "auto";
}
