import { z } from "zod";

/** Tipos de expiración del código promocional. */
export const PROMOTIONAL_CODE_EXPIRATION_TYPES = ["por_tiempo", "por_usos"] as const;
export type PromotionalCodeExpirationType = (typeof PROMOTIONAL_CODE_EXPIRATION_TYPES)[number];

/** Tipos de beneficio del código promocional. */
export const PROMOTIONAL_CODE_BENEFIT_TYPES = ["descuento", "meses_gratuitos"] as const;
export type PromotionalCodeBenefitType = (typeof PROMOTIONAL_CODE_BENEFIT_TYPES)[number];

const codeField = z
  .string()
  .trim()
  .min(3, "El código debe tener al menos 3 caracteres")
  .max(50, "El código no puede superar 50 caracteres")
  .regex(/^[A-Za-z0-9_-]+$/, "Solo letras, números, guiones y guiones bajos");

const benefitValueField = z.coerce
  .number()
  .positive("El valor del beneficio debe ser mayor a 0");

const basePromotionalCodeFields = z.object({
  code: codeField,
  expirationType: z.enum(PROMOTIONAL_CODE_EXPIRATION_TYPES, {
    required_error: "El tipo de expiración es obligatorio",
    invalid_type_error: "Tipo de expiración inválido",
  }),
  expiresAt: z.coerce.date().optional().nullable(),
  maxUses: z.coerce.number().int().positive().optional().nullable(),
  benefitType: z.enum(PROMOTIONAL_CODE_BENEFIT_TYPES, {
    required_error: "El tipo de beneficio es obligatorio",
    invalid_type_error: "Tipo de beneficio inválido",
  }),
  benefitValue: benefitValueField,
});

/** Esquema para crear un código promocional desde el panel admin. */
export const createPromotionalCodeSchema = basePromotionalCodeFields.superRefine((data, ctx) => {
  if (data.expirationType === "por_tiempo") {
    if (!data.expiresAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La fecha de expiración es obligatoria cuando el código expira por tiempo",
        path: ["expiresAt"],
      });
    } else if (data.expiresAt <= new Date()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La fecha de expiración debe ser posterior a la fecha actual",
        path: ["expiresAt"],
      });
    }
    if (data.maxUses != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "El límite de usos no aplica cuando el código expira por tiempo",
        path: ["maxUses"],
      });
    }
  }

  if (data.expirationType === "por_usos") {
    if (data.maxUses == null || data.maxUses < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "El límite máximo de usos es obligatorio cuando el código expira por usos",
        path: ["maxUses"],
      });
    }
    if (data.expiresAt != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La fecha de expiración no aplica cuando el código expira por usos",
        path: ["expiresAt"],
      });
    }
  }

  if (data.benefitType === "descuento" && data.benefitValue > 100) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "El descuento no puede superar el 100%",
      path: ["benefitValue"],
    });
  }

  if (data.benefitType === "meses_gratuitos" && !Number.isInteger(data.benefitValue)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Los meses gratuitos deben ser un número entero",
      path: ["benefitValue"],
    });
  }

});

export type CreatePromotionalCodeInput = z.infer<typeof createPromotionalCodeSchema>;

/** Esquema para actualizar un código promocional (mismas reglas condicionales que crear). */
export const updatePromotionalCodeSchema = createPromotionalCodeSchema;

export type UpdatePromotionalCodeInput = z.infer<typeof updatePromotionalCodeSchema>;

export const validatePromotionalCodeRequestSchema = z.object({
  code: z.string().trim().min(1, "El código es obligatorio"),
});

export type ValidatePromotionalCodeRequest = z.infer<typeof validatePromotionalCodeRequestSchema>;

export type PromotionalCodeValidationSuccess = {
  valid: true;
  benefitType: PromotionalCodeBenefitType;
  benefitValue: number;
};

export type PromotionalCodeValidationFailure = {
  valid: false;
  message: string;
};

export type PromotionalCodeValidationResult =
  | PromotionalCodeValidationSuccess
  | PromotionalCodeValidationFailure;

export const redeemPromotionalCodeRequestSchema = z.object({
  code: z.string().trim().min(1, "El código es obligatorio"),
  subscriptionMonths: z.coerce.number().int().min(1).max(12).default(1),
  monthlyUsd: z.coerce.number().positive(),
});

export type RedeemPromotionalCodeRequest = z.infer<typeof redeemPromotionalCodeRequestSchema>;

export type RedeemPromotionalCodeFreeMonths = {
  applied: "meses_gratuitos";
  monthsGranted: number;
  message: string;
};

export type RedeemPromotionalCodeDiscount = {
  applied: "descuento";
  benefitValue: number;
  originalTotalUsd: number;
  discountedTotalUsd: number;
  discountUsd: number;
};

export type RedeemPromotionalCodeResult =
  | RedeemPromotionalCodeFreeMonths
  | RedeemPromotionalCodeDiscount;

/** Calcula el total con descuento porcentual sobre la mensualidad/quincena. */
export function applySubscriptionDiscountPercent(totalUsd: number, percent: number): number {
  const factor = Math.max(0, Math.min(100, percent));
  return Math.round(totalUsd * (1 - factor / 100) * 100) / 100;
}
