import { z } from "zod";
import { insertServiceSchema } from "./schema";
import { providerSkillsSchema } from "./skills-schema";
import {
  createServiceCategorySlug,
  createServiceRequiresSubcategory,
  isCatalogAssignableSlug,
  isProfessionalListingCategorySlug,
  isTradeListingCategorySlug,
} from "./create-service-catalog-context";
import type { CategoryWithSlug } from "./create-service-catalog-context";

/**
 * Esquema del formulario «Agregar servicio de catálogo».
 * `getCategories` permite que react-hook-form use un resolver estable mientras la lista de categorías se hidrata (ref en el cliente).
 */
export function buildCreateServiceFormSchema(getCategories: () => readonly CategoryWithSlug[]) {
  return insertServiceSchema
    .extend({
      subcategoryId: z.number().int().positive().optional().nullable(),
      preparationLevel: z.string().optional(),
      certifications: z.string().optional(),
      yearsExperience: z.coerce.number().int().min(0).default(0),
      skills: providerSkillsSchema,
      profession: z.string().optional(),
      bio: z.string().optional(),
    })
    .superRefine((data, ctx) => {
      const slug = createServiceCategorySlug(data.categoryId, getCategories());

      if (!slug || !isCatalogAssignableSlug(slug)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Selecciona una categoría válida.",
          path: ["categoryId"],
        });
        return;
      }

      if (createServiceRequiresSubcategory(slug)) {
        if (data.subcategoryId == null || Number(data.subcategoryId) <= 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Selecciona una subcategoría.",
            path: ["subcategoryId"],
          });
        }
      }

      if (isTradeListingCategorySlug(slug)) {
        const prep = (data.preparationLevel ?? "").trim();
        if (prep.length < 10) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              "Describe tu nivel de preparación (escolaridad, cursos, talleres). Mínimo 10 caracteres.",
            path: ["preparationLevel"],
          });
        }
        const title = (data.title ?? "").trim();
        if (title.length < 2) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Indica el nombre público de tu servicio (mínimo 2 caracteres).",
            path: ["title"],
          });
        }
        const desc = (data.description ?? "").trim();
        if (desc.length > 5000) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Máximo 5000 caracteres en la descripción del servicio.",
            path: ["description"],
          });
        }
        return;
      }

      const title = (data.title ?? "").trim();
      if (title.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Indica el nombre público de tu servicio (mínimo 2 caracteres).",
          path: ["title"],
        });
      }

      const description = (data.description ?? "").trim();
      if (description.length > 5000) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Máximo 5000 caracteres en la descripción del servicio.",
          path: ["description"],
        });
      }

      if (isProfessionalListingCategorySlug(slug)) {
        const bio = (data.bio ?? "").trim();
        if (bio.length < 50) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Escribe al menos 50 caracteres en tu biografía (un poco más que un eslogan).",
            path: ["bio"],
          });
        }
        const prof = (data.profession ?? "").trim();
        if (prof.length < 2) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Indica tu profesión o título (mínimo 2 caracteres).",
            path: ["profession"],
          });
        }
      }
    });
}

const _schemaForTypes = buildCreateServiceFormSchema(() => []);
export type CreateServiceFormValues = z.infer<typeof _schemaForTypes>;
