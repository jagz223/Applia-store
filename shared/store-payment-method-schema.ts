import { z } from "zod";

export const storePaymentMethodExtraFieldSchema = z.object({
  name: z.string().trim().min(1, "El nombre del campo es obligatorio").max(80),
  value: z.string().trim().min(1, "El valor es obligatorio").max(200),
});

export type StorePaymentMethodExtraField = z.infer<typeof storePaymentMethodExtraFieldSchema>;

export const storePaymentMethodExtraFieldsSchema = z
  .array(storePaymentMethodExtraFieldSchema)
  .max(30)
  .default([]);

export function normalizeStorePaymentMethodExtraFields(
  raw: unknown,
): StorePaymentMethodExtraField[] {
  if (!Array.isArray(raw)) return [];
  const out: StorePaymentMethodExtraField[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const name = String((item as { name?: unknown }).name ?? "").trim();
    const value = String((item as { value?: unknown }).value ?? "").trim();
    if (!name || !value) continue;
    out.push({ name: name.slice(0, 80), value: value.slice(0, 200) });
    if (out.length >= 30) break;
  }
  return out;
}

/** Texto legado para órdenes / vistas que solo tienen accountNumber. */
export function formatStorePaymentMethodExtraFieldsAsText(
  fields: StorePaymentMethodExtraField[],
): string {
  return fields.map((f) => `${f.name}: ${f.value}`).join("\n");
}

export const insertStorePaymentMethodSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(120),
  /** Oculto en UI; se mantiene por compatibilidad (puede quedar vacío). */
  accountNumber: z.string().trim().max(80).optional().default(""),
  imageUrl: z.string().trim().min(1).max(2000).nullable().optional(),
  extraFields: storePaymentMethodExtraFieldsSchema.optional().default([]),
});

export type InsertStorePaymentMethod = z.infer<typeof insertStorePaymentMethodSchema>;

export const updateStorePaymentMethodSchema = insertStorePaymentMethodSchema.partial();

export type UpdateStorePaymentMethod = z.infer<typeof updateStorePaymentMethodSchema>;

export type StorePaymentMethod = {
  id: number;
  storeId: number;
  /** Banco o aplicación (ej. Banco Pichincha, PayPal). */
  name: string;
  /** Número de cuenta legado (opcional / oculto en UI). */
  accountNumber: string;
  /** Datos extra dinámicos (nombre + valor). */
  extraFields: StorePaymentMethodExtraField[];
  /** Imagen opcional (p. ej. código QR). */
  imageUrl: string | null;
  /** Método de sistema (p. ej. cashea); no editable desde el panel normal. */
  systemKind?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};
