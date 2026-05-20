import { z } from "zod";
import { insertProviderVehicleSchema } from "@shared/vehicle-schema";

export const centralMemberTypeSchema = z.enum(["central", "driver"]);

export const centralMemberUserFieldsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(2),
  lastName: z.string().min(2),
  phone: z.string().min(1),
});

export const registerCentralMemberSchema = centralMemberUserFieldsSchema
  .extend({
    companyId: z.string().optional(),
    memberType: centralMemberTypeSchema,
    offerKind: z.enum(["moto", "carro", "camion", "pet"]).optional(),
    vehicle: insertProviderVehicleSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.memberType === "driver" && !data.vehicle) {
      ctx.addIssue({
        code: "custom",
        message: "Los datos del vehículo son obligatorios para conductores.",
        path: ["vehicle"],
      });
    }
  });

export const patchCentralMemberSchema = z.object({
  companyId: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().min(1).max(50).optional(),
  newPassword: z.string().min(6).max(100).optional(),
});

export type CentralMemberType = z.infer<typeof centralMemberTypeSchema>;
export type RegisterCentralMemberInput = z.infer<typeof registerCentralMemberSchema>;
export type PatchCentralMemberInput = z.infer<typeof patchCentralMemberSchema>;

export type CentralMemberSummary = {
  userId: string;
  memberType: CentralMemberType;
  name: string;
  lastName: string;
  email: string;
  phone: string;
  role: string;
  licensePlate: string | null;
  vehicleLabel: string | null;
  createdAt: string | null;
  /** Conductor que se afilió con cuenta propia: la central no edita credenciales. */
  credentialsManagedOutsideCentral?: boolean;
};
