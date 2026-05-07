import { z } from "zod";

/** Documento Firestore: un registro por usuario profesional (id de documento = userId). */
export const professionalVerificationSchema = z.object({
  userId: z.string(),
  /** URL en Firebase Storage del documento de identificación */
  imageUrl: z.string().nullable().optional(),
  /** Solo el admin puede ponerlo en true */
  imageVerified: z.boolean().default(false),
  /** Documento que avala la profesión (certificado / título). Se guarda también en Mis documentos. */
  professionalCredentialUrl: z.string().nullable().optional(),
  /** Código / comprobante de transferencia del pago de verificación */
  transferReceiptCode: z.string().nullable().optional(),
  /** Fecha de la transferencia (yyyy-MM-dd) */
  transferDate: z.string().nullable().optional(),
  createdAt: z.union([z.date(), z.string()]).optional(),
  updatedAt: z.union([z.date(), z.string()]).optional(),
});

export type ProfessionalVerification = z.infer<typeof professionalVerificationSchema>;

export function isProfessionalVerificationLocked(v: Partial<ProfessionalVerification> | null | undefined): boolean {
  if (!v) return false;
  const img = typeof v.imageUrl === "string" ? v.imageUrl.trim() : "";
  const code = typeof v.transferReceiptCode === "string" ? v.transferReceiptCode.trim() : "";
  const date = typeof v.transferDate === "string" ? v.transferDate.trim() : "";
  return Boolean(img) && Boolean(code) && Boolean(date);
}

export const patchProfessionalVerificationImageBody = z.object({
  imageUrl: z.string().url().min(1),
});

export const patchProfessionalVerificationCredentialBody = z.object({
  professionalCredentialUrl: z.string().url().min(1),
  /** Nombre para mostrar/guardar en Mis documentos. */
  name: z.string().min(1).max(200).optional(),
  mimeType: z.string().min(1).max(200).optional(),
  size: z.number().optional(),
});

export const patchProfessionalVerificationPaymentBody = z.object({
  transferReceiptCode: z.string().min(1).max(500),
  transferDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// ============ verifying_status (nueva colección) ============

export const professionalVerificationStateSchema = z.enum(["rejected", "pending", "verified"]);
export type ProfessionalVerificationState = z.infer<typeof professionalVerificationStateSchema>;

/**
 * Tipo de solicitud: onboarding (alta inicial) vs renewal (renovación simple de cuota USD 15).
 * Se guarda en `verifying_status` para que el admin pueda distinguir flujos sin inferencias frágiles.
 */
export const verificationRequestTypeSchema = z.enum(["onboarding", "renewal"]);
export type VerificationRequestType = z.infer<typeof verificationRequestTypeSchema>;

/**
 * Colección Firestore `verifying_status` (1 doc por userId).
 * Nota: respetamos el nombre solicitado: `transacction_date` y `transacction_verified`.
 */
export const verifyingStatusSchema = z.object({
  user: z.string(),
  /** Puede faltar en docs antiguos; default = onboarding. */
  requestType: verificationRequestTypeSchema.optional(),
  identification_verified: professionalVerificationStateSchema,
  /** null = aún no enviado / sin valor en Firestore */
  transacction_date: z.string().nullable(),
  transacction_verified: professionalVerificationStateSchema.nullable(),
  createdAt: z.union([z.date(), z.string()]).optional(),
  updatedAt: z.union([z.date(), z.string()]).optional(),
});

export type VerifyingStatus = z.infer<typeof verifyingStatusSchema>;

export const patchVerifyingStatusIdentificationBody = z.object({
  // se setea a "pending" al subir la imagen; admin lo actualizará a "verified"/"rejected"
  identification_verified: z.literal("pending"),
});

export const patchVerifyingStatusPaymentBody = z.object({
  transacction_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  transacction_verified: z.literal("pending"),
});
