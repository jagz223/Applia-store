import type { VehicleType } from "@shared/vehicle-schema";

export const DEFAULT_GO_VEHICLE_FORM = {
  license_plate: "",
  model_year: new Date().getFullYear(),
  brand: "",
  model: "",
  vehicle_status: "active" as "active" | "inactive" | "maintenance" | "pending_inspection",
  vehicle_type: "car" as VehicleType,
  is_pet_friendly: false,
  exterior_color: "",
  insurance_expires_at: "",
  mileage_km: "" as string | number,
  service_notes: "",
};

export type GoVehicleFormValues = Omit<typeof DEFAULT_GO_VEHICLE_FORM, "model_year"> & {
  model_year: number | "";
};

export function buildGoVehiclePayload(v: GoVehicleFormValues) {
  const mileageRaw = v.mileage_km === "" || v.mileage_km == null ? null : Number(v.mileage_km);
  return {
    license_plate: v.license_plate.trim(),
    model_year: Number(v.model_year),
    brand: v.brand.trim(),
    model: v.model.trim(),
    vehicle_status: v.vehicle_status,
    vehicle_type: v.vehicle_type,
    is_pet_friendly: Boolean(v.is_pet_friendly),
    exterior_color: v.exterior_color.trim() || null,
    passenger_seats: null as number | null,
    insurance_expires_at: v.insurance_expires_at.trim() || null,
    mileage_km: mileageRaw != null && Number.isFinite(mileageRaw) ? mileageRaw : null,
    service_notes: v.service_notes.trim() || null,
  };
}
