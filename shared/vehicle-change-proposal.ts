import { z } from "zod";
import { insertProviderVehicleSchema } from "./vehicle-schema";

/** Propuesta de cambio de categoría Go + vehículo (revisión admin antes de aplicar). */
export const vehicleChangeProposalSchema = z.object({
  categoryId: z.number().int().positive(),
  subcategoryId: z.number().int().positive().nullable().optional(),
  /** Marcas Go habilitadas, p. ej. `["transport"]`, `["delivery","transport"]`. */
  goBrands: z.array(z.string().trim().min(1)).min(1, "Indica al menos una marca Car Go (taxi o delivery)."),
  vehicle: insertProviderVehicleSchema,
});

export type VehicleChangeProposal = z.infer<typeof vehicleChangeProposalSchema>;
