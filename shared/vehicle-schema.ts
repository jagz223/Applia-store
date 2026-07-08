import { z } from "zod";

/** Car Go / transport: vehicle types offered by the driver. */
export const vehicleTypeSchema = z.enum(["motorcycle", "car", "pickup_truck", "truck"]);

/** Operational state for dispatch and compliance. */
export const vehicleStatusSchema = z.enum([
  "active",
  "inactive",
  "maintenance",
  "pending_inspection",
]);

export const insertProviderVehicleSchema = z
  .object({
    license_plate: z
      .string()
      .trim()
      .min(2, { message: "Indica la placa." })
      .max(24, { message: "Placa demasiado larga." }),
    model_year: z.coerce
      .number()
      .int()
      .min(1980)
      .max(new Date().getFullYear() + 1, { message: "Año no válido." }),
    brand: z.string().trim().min(1).max(80),
    model: z.string().trim().min(1).max(80),
    vehicle_status: vehicleStatusSchema,
    vehicle_type: vehicleTypeSchema,
    /** Only meaningful for `car` and `pickup_truck`; must be false otherwise. */
    is_pet_friendly: z.boolean(),
    exterior_color: z.string().trim().max(40).optional().nullable(),
    /** Seats for passengers (excluding driver). */
    passenger_seats: z.number().int().min(1).max(60).optional().nullable(),
    /** ISO date string (YYYY-MM-DD) when mandatory insurance expires, if applicable. */
    insurance_expires_at: z.string().trim().max(32).optional().nullable(),
    /** Odometer; empty string from forms is treated as unset (null). */
    mileage_km: z.preprocess(
      (val) => {
        if (val === "" || val === null || val === undefined) return null;
        if (typeof val === "number") return Number.isFinite(val) ? val : null;
        const n = Number(String(val).trim());
        return Number.isFinite(n) ? n : null;
      },
      z.number().int().min(0).max(2_000_000).nullable().optional()
    ),
    /** Optional notes (vehicle condition, accessories, etc.). */
    service_notes: z.string().trim().max(500).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    const petOk = data.vehicle_type === "car" || data.vehicle_type === "pickup_truck";
    if (!petOk && data.is_pet_friendly) {
      ctx.addIssue({
        code: "custom",
        message: "Solo vehículos tipo carro o camioneta pueden marcar transporte de mascotas.",
        path: ["is_pet_friendly"],
      });
    }
  });

export type InsertProviderVehicle = z.infer<typeof insertProviderVehicleSchema>;
export type VehicleType = z.infer<typeof vehicleTypeSchema>;
export type VehicleStatus = z.infer<typeof vehicleStatusSchema>;
