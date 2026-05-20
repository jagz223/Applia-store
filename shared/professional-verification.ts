import { z } from "zod";
import { isVisibilitySubscriptionWindowActive } from "./professional-listing-subscription";

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
  /** Cuántos meses está pagando (1–12). Si falta, asumir 1. */
  subscriptionMonths: z.number().int().min(1).max(12).nullable().optional(),
  /** Mensualidad (USD) vigente al momento de registrar el comprobante. */
  subscriptionMonthlyUsd: z.number().min(0).max(10_000).nullable().optional(),
  /** Código promocional de descuento aplicado al registrar el comprobante. */
  promotionalCode: z.string().nullable().optional(),
  /** Porcentaje de descuento del código (solo si aplica). */
  promotionalDiscountPercent: z.number().min(1).max(100).nullable().optional(),
  /** Total antes del descuento (USD). */
  subscriptionOriginalTotalUsd: z.number().min(0).nullable().optional(),
  /** Total que el asociado debió transferir tras el descuento (USD). */
  subscriptionDiscountedTotalUsd: z.number().min(0).nullable().optional(),
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

/** Alta inicial: el admin solo debe ver la solicitud cuando hay identificación, documento profesional y pago registrados. */
export function isAssociateOnboardingDossierComplete(
  v: Pick<ProfessionalVerification, "imageUrl" | "professionalCredentialUrl" | "transferReceiptCode" | "transferDate"> | null | undefined,
): boolean {
  const img = typeof v?.imageUrl === "string" && v.imageUrl.trim().length > 0;
  const cred = typeof v?.professionalCredentialUrl === "string" && v.professionalCredentialUrl.trim().length > 0;
  const code = typeof v?.transferReceiptCode === "string" && v.transferReceiptCode.trim().length > 0;
  const date = typeof v?.transferDate === "string" && v.transferDate.trim().length > 0;
  return img && cred && code && date;
}

/** Slice mínimo del proveedor para saber si la cuota de visibilidad quedó cubierta por canje de meses gratis. */
export type PrefundPromoProviderSlice = {
  visibilitySubscriptionLastPaymentApprovedBy?: string | null;
  visibilitySubscriptionEndsAt?: unknown;
};

export function hasVerificationCuotaSatisfiedByPromoPrefund(
  provider: PrefundPromoProviderSlice | null | undefined,
): boolean {
  if (!provider) return false;
  const by = String(provider.visibilitySubscriptionLastPaymentApprovedBy ?? "").trim();
  return by === "promotional_code" && isVisibilitySubscriptionWindowActive(provider.visibilitySubscriptionEndsAt);
}

/** Identificación + documento profesional (o licencia) subidos. */
export function isAssociateOnboardingVerificationDocsComplete(
  v: Pick<ProfessionalVerification, "imageUrl" | "professionalCredentialUrl"> | null | undefined,
): boolean {
  const img = typeof v?.imageUrl === "string" && v.imageUrl.trim().length > 0;
  const cred = typeof v?.professionalCredentialUrl === "string" && v.professionalCredentialUrl.trim().length > 0;
  return img && cred;
}

/**
 * Alta inicial: el asociado puede entrar a la cola del admin cuando tiene ambos documentos y
 * (comprobante de transferencia registrado) o (meses gratis por código con suscripción vigente).
 */
export function isAssociateOnboardingAdminQueueReady(
  v: Pick<ProfessionalVerification, "imageUrl" | "professionalCredentialUrl" | "transferReceiptCode" | "transferDate"> | null | undefined,
  provider: PrefundPromoProviderSlice | null | undefined,
): boolean {
  if (!isAssociateOnboardingVerificationDocsComplete(v)) return false;
  if (isAssociateOnboardingDossierComplete(v)) return true;
  return hasVerificationCuotaSatisfiedByPromoPrefund(provider);
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

export const patchProfessionalVerificationPaymentBody = z
  .object({
    transferReceiptCode: z.string().min(1).max(500),
    transferDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    subscriptionMonths: z.number().int().min(1).max(12),
    promotionalCode: z.string().trim().min(1).max(50).optional(),
    promotionalDiscountPercent: z.number().min(1).max(100).optional(),
    subscriptionOriginalTotalUsd: z.number().min(0).optional(),
    subscriptionDiscountedTotalUsd: z.number().min(0).optional(),
  })
  .superRefine((data, ctx) => {
    const hasCode = Boolean(data.promotionalCode?.trim());
    const hasDiscount =
      data.promotionalDiscountPercent != null &&
      data.subscriptionOriginalTotalUsd != null &&
      data.subscriptionDiscountedTotalUsd != null;
    if (hasCode && !hasDiscount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Faltan datos del descuento promocional",
        path: ["promotionalDiscountPercent"],
      });
    }
    if (!hasCode && (data.promotionalDiscountPercent != null || data.subscriptionDiscountedTotalUsd != null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "El código promocional es obligatorio si se envía un descuento",
        path: ["promotionalCode"],
      });
    }
  });

export type SubscriptionPaymentPromoSnapshot = {
  promotionalCode: string;
  promotionalDiscountPercent: number;
  subscriptionOriginalTotalUsd: number;
  subscriptionDiscountedTotalUsd: number;
};

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
  /** Reemplazos de identificación mientras `identification_verified === "pending"` (máx. 1). */
  pendingIdResubmitCount: z.number().int().min(0).max(10).optional(),
  /** Reemplazos del documento profesional/licencia mientras la solicitud está en revisión (máx. 1). */
  pendingCredentialResubmitCount: z.number().int().min(0).max(10).optional(),
  /** true mientras canjeó meses gratis antes de tener documentos listos para la cola del admin. */
  prefundPromoAwaitingDossier: z.boolean().optional(),
  /** Código canjeado (auditoría / UI admin). */
  prefundPromoCode: z.string().max(80).optional(),
  prefundPromoMonths: z.number().int().min(1).max(12).optional(),
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
