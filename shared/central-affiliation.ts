import { z } from "zod";

/** Solicitud de un conductor Go para vincularse a una central (sin asignar empresa hasta aprobación). */
export const centralAffiliationStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
  "cancelled",
]);

export const centralDataAccessStatusSchema = z.enum(["none", "requested", "granted"]);

export type CentralAffiliationStatus = z.infer<typeof centralAffiliationStatusSchema>;
export type CentralDataAccessStatus = z.infer<typeof centralDataAccessStatusSchema>;

export type CentralAffiliationRequestRecord = {
  id: string;
  applicantUserId: string;
  providerId: number;
  dispatchCompanyId: string;
  status: CentralAffiliationStatus;
  dataAccessStatus: CentralDataAccessStatus;
  createdAt: string;
  updatedAt: string;
  /** Usuario central que solicitó acceso a datos ampliados. */
  dataAccessRequestedByUserId?: string | null;
  dataAccessRequestedAt?: string | null;
};

export const postGoDriverPendingCentralSchema = z.object({
  pendingCentralCompanyId: z.string().min(1).max(80).optional(),
});

export const NOTIFICATION_TYPE_CENTRAL_AFFILIATION = "central_affiliation_request";
export const NOTIFICATION_TYPE_CENTRAL_DATA_ACCESS = "central_data_access_request";
/** La central aprobó la solicitud de afiliación del conductor. */
export const NOTIFICATION_TYPE_CENTRAL_AFFILIATION_APPROVED = "central_affiliation_approved";
/** La central rechazó la solicitud de afiliación del conductor. */
export const NOTIFICATION_TYPE_CENTRAL_AFFILIATION_REJECTED = "central_affiliation_rejected";
