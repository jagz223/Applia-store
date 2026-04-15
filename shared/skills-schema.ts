import { z } from "zod";
import { containsProfanity } from "./profanity-es";

const MAX_SKILLS = 20;
const MAX_SKILL_LEN = 60;

function cleanSkillList(arr: string[]): string[] {
  return arr.map((s) => s.trim()).filter((s) => s.length > 0);
}

const skillsInnerSchema = z
  .array(z.string())
  .superRefine((arr, ctx) => {
    const items = cleanSkillList(arr);
    if (items.length > MAX_SKILLS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Máximo ${MAX_SKILLS} habilidades.`,
      });
      return;
    }
    for (const s of items) {
      if (s.length > MAX_SKILL_LEN) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Cada habilidad puede tener como máximo ${MAX_SKILL_LEN} caracteres.`,
        });
        return;
      }
      if (containsProfanity(s)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "No uses lenguaje inapropiado en las habilidades.",
        });
        return;
      }
    }
  })
  .transform((arr) => cleanSkillList(arr));

/** Lista de habilidades (POST/PATCH proveedor y formularios). */
export const providerSkillsSchema = z.preprocess(
  (val: unknown) => (Array.isArray(val) ? val.map((x) => String(x)) : []),
  skillsInnerSchema
);
