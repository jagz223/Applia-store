import { z } from "zod";

/** Preguntas frecuentes para recuperación de cuenta (el usuario elige 3 distintas). */
export const RECOVERY_QUESTION_OPTIONS = [
  { id: "childhood_friend", label: "¿Cuál es el nombre de tu mejor amigo/a de la infancia?" },
  { id: "mother_maiden", label: "¿Cuál es el apellido de soltera de tu madre?" },
  { id: "first_pet", label: "¿Cuál fue el nombre de tu primera mascota?" },
  { id: "birth_city", label: "¿En qué ciudad naciste?" },
  { id: "first_school", label: "¿Cuál fue el nombre de tu primera escuela?" },
  { id: "favorite_teacher", label: "¿Cuál es el nombre de tu profesor/a favorito/a?" },
  { id: "childhood_street", label: "¿Cuál es el nombre de la calle donde creciste?" },
  { id: "first_car", label: "¿Cuál fue tu primer auto o vehículo?" },
  { id: "favorite_food", label: "¿Cuál es tu comida favorita?" },
  { id: "childhood_nickname", label: "¿Cuál era tu apodo de niño/a?" },
  { id: "father_middle", label: "¿Cuál es el segundo nombre de tu padre?" },
  { id: "wedding_city", label: "¿En qué ciudad se casaron tus padres (o tú)?" },
] as const;

export type RecoveryQuestionId = (typeof RECOVERY_QUESTION_OPTIONS)[number]["id"];

const questionIdSet = new Set(RECOVERY_QUESTION_OPTIONS.map((q) => q.id));

export function getRecoveryQuestionLabel(questionId: string): string {
  const found = RECOVERY_QUESTION_OPTIONS.find((q) => q.id === questionId);
  return found?.label ?? questionId;
}

/** Normaliza respuestas para comparación (sin distinguir mayúsculas ni espacios extra). */
export function normalizeRecoveryAnswer(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ");
}

export const recoveryQuestionAnswerSchema = z.object({
  questionId: z
    .string()
    .min(1)
    .refine((id) => questionIdSet.has(id as RecoveryQuestionId), "Pregunta no válida"),
  answer: z
    .string()
    .min(2, "La respuesta debe tener al menos 2 caracteres")
    .max(120, "Máximo 120 caracteres")
    .transform((s) => s.trim()),
});

export const recoveryQuestionsSetupSchema = z
  .array(recoveryQuestionAnswerSchema)
  .length(3, "Debes configurar exactamente 3 preguntas")
  .superRefine((arr, ctx) => {
    const ids = arr.map((a) => a.questionId);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Las 3 preguntas deben ser distintas",
      });
    }
  });

export type RecoveryQuestionStored = {
  questionId: string;
  answerHash: string;
};

export const forgotPasswordLookupSchema = z.object({
  email: z
    .string()
    .min(1)
    .email()
    .transform((s) => s.trim().toLowerCase()),
});

export const forgotPasswordVerifySchema = z.object({
  email: forgotPasswordLookupSchema.shape.email,
  answers: recoveryQuestionsSetupSchema,
});

export const forgotPasswordResetSchema = z.object({
  resetToken: z.string().min(10),
  newPassword: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
  confirmPassword: z.string().min(6),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: "Las contraseñas no coinciden",
  path: ["confirmPassword"],
});

/** Cambio de contraseña desde Configuración (sesión + preguntas de recuperación). */
export const changePasswordWithRecoverySchema = z
  .object({
    answers: recoveryQuestionsSetupSchema,
    newPassword: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
    confirmPassword: z.string().min(6),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });
