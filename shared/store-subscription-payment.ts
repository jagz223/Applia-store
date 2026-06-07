import { z } from "zod";

/** Tipo de reporte financiero para pagos de mensualidad de tienda. */
export const STORE_SUBSCRIPTION_FEE_REPORT_TYPE = "store_subscription_fee";

export const storeSubscriptionPaymentBodySchema = z.object({
  transferReceiptCode: z.string().trim().min(1, "El código de transferencia es obligatorio"),
  transferDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (use AAAA-MM-DD)"),
  subscriptionMonths: z.coerce.number().int().min(1).max(12).optional().default(1),
});

export type StoreSubscriptionPaymentBody = z.infer<typeof storeSubscriptionPaymentBodySchema>;

export const storeSubscriptionPaymentReviewSchema = z.object({
  action: z.enum(["approve", "reject"]),
  reason: z.string().trim().max(500).optional(),
});

export type StoreSubscriptionPaymentReviewBody = z.infer<typeof storeSubscriptionPaymentReviewSchema>;
