import { z } from "zod";

export const PRODUCT_IMPORT_OPTIONAL_FIELDS = [
  "description",
  "stock",
  "imageUrl",
  "category",
  "subcategory",
  "ingredients",
  "weight",
] as const;

export type ProductImportOptionalField = (typeof PRODUCT_IMPORT_OPTIONAL_FIELDS)[number];

export const PRODUCT_IMPORT_OPTIONAL_FIELD_LABELS: Record<ProductImportOptionalField, string> = {
  description: "Descripción",
  stock: "Stock",
  imageUrl: "Link de imagen",
  category: "Categoría",
  subcategory: "Subcategoría",
  ingredients: "Ingredientes",
  weight: "Peso",
};

export const PRODUCT_IMPORT_CSV_DELIMITERS = [",", ";", "|"] as const;
export type ProductImportCsvDelimiter = (typeof PRODUCT_IMPORT_CSV_DELIMITERS)[number];

export const PRODUCT_IMPORT_CSV_DELIMITER_LABELS: Record<ProductImportCsvDelimiter, string> = {
  ",": "Coma (,)",
  ";": "Punto y coma (;)",
  "|": "Barra vertical (|)",
};

export function isProductImportOptionalField(value: unknown): value is ProductImportOptionalField {
  return (
    typeof value === "string" &&
    (PRODUCT_IMPORT_OPTIONAL_FIELDS as readonly string[]).includes(value)
  );
}

export function parseProductImportCsvDelimiter(raw: unknown): ProductImportCsvDelimiter {
  const v = String(raw ?? "").trim();
  if (v === ";" || v === "|") return v;
  return ",";
}

export const productImportOptionalMappingSchema = z.object({
  column: z.string().trim().min(1).max(120),
  field: z.enum(PRODUCT_IMPORT_OPTIONAL_FIELDS),
});

export type ProductImportOptionalMapping = z.infer<typeof productImportOptionalMappingSchema>;

export function normalizeProductImportOptionals(
  raw: unknown,
): ProductImportOptionalMapping[] {
  if (!Array.isArray(raw)) return [];
  const out: ProductImportOptionalMapping[] = [];
  const usedFields = new Set<ProductImportOptionalField>();
  for (const item of raw) {
    const parsed = productImportOptionalMappingSchema.safeParse(item);
    if (!parsed.success) continue;
    if (usedFields.has(parsed.data.field)) continue;
    usedFields.add(parsed.data.field);
    out.push(parsed.data);
    if (out.length >= PRODUCT_IMPORT_OPTIONAL_FIELDS.length) break;
  }
  return out;
}
