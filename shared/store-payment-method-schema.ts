import { z } from "zod";

export const insertStorePaymentMethodSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(120),
  accountNumber: z.string().trim().min(1, "El número de cuenta es obligatorio").max(80),
  imageUrl: z.string().trim().min(1).max(2000).nullable().optional(),
});

export type InsertStorePaymentMethod = z.infer<typeof insertStorePaymentMethodSchema>;

export const updateStorePaymentMethodSchema = insertStorePaymentMethodSchema.partial();

export type UpdateStorePaymentMethod = z.infer<typeof updateStorePaymentMethodSchema>;

export type StorePaymentMethod = {
  id: number;
  storeId: number;
  /** Banco o aplicación (ej. Banco Pichincha, PayPal). */
  name: string;
  /** Número de cuenta o identificador de pago. */
  accountNumber: string;
  /** Imagen opcional (p. ej. código QR). */
  imageUrl: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};
