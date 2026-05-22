import { z } from "zod";
import { normalizePhone } from "./admin-user-registration";

/** Mensajes de recuperación (forgot-password vs configuración). */
export const FORGOT_PASSWORD_NOT_REGISTERED_MSG =
  "Correo o número de teléfono no registrado.";
export const FORGOT_PASSWORD_NO_RECOVERY_MSG =
  "Esta cuenta no tiene preguntas de recuperación configuradas.";
export const FORGOT_PASSWORD_WRONG_RECOVERY_MSG =
  "Datos erróneos. Por favor, ingresa los correctos.";
export const SETTINGS_WRONG_RECOVERY_MSG =
  "Los datos ingresados no son correctos. Revisa las preguntas y respuestas e inténtalo de nuevo.";

export const FORGOT_PASSWORD_WRONG_RECOVERY_CODE = "wrong_recovery";

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

/** Buscar cuenta por correo o por teléfono (un solo campo por petición). */
export const forgotPasswordLookupSchema = z.union([
  z.object({
    email: z
      .string()
      .min(1, "El correo es obligatorio")
      .email("Correo inválido")
      .transform((s) => s.trim().toLowerCase()),
  }),
  z.object({
    phone: z
      .string()
      .min(1, "El teléfono es obligatorio")
      .transform((s) => normalizePhone(s)),
  }),
]);

export const forgotPasswordVerifySchema = z.object({
  email: z
    .string()
    .min(1)
    .email()
    .transform((s) => s.trim().toLowerCase()),
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
