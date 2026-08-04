import { z } from "zod";
import { isFullAdmin } from "./roles";

/** Roles permitidos en el registro público (solo cliente; asociados ya no se registran aquí). */
export const PUBLIC_REGISTER_ROLES = ["client"] as const;
export type PublicRegisterRole = (typeof PUBLIC_REGISTER_ROLES)[number];

/** Roles base que staff (admin o Soporte TI) puede asignar al crear usuarios. */
export const STAFF_CREATABLE_ROLES = ["client", "professional", "central"] as const;

/** Roles de staff que solo el administrador completo puede asignar. */
export const FULL_ADMIN_ONLY_ASSIGN_ROLES = ["admin", "tiSupport"] as const;

/** @deprecated Usar FULL_ADMIN_ONLY_ASSIGN_ROLES */
export const FULL_ADMIN_EXTRA_ROLES = FULL_ADMIN_ONLY_ASSIGN_ROLES;

export function normalizePhone(raw: string): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  const hasPlus = s.startsWith("+");
  const digits = s.replace(/[^\d]/g, "");
  return hasPlus ? `+${digits}` : digits;
}

export const adminCreateUserSchema = z
  .object({
    email: z
      .string()
      .min(1, "El correo es obligatorio")
      .email("Email inválido")
      .transform((s) => s.trim().toLowerCase()),
    password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
    name: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
    lastName: z.string().min(2, "El apellido debe tener al menos 2 caracteres"),
    phone: z.string().min(1, "El teléfono es obligatorio").transform((s) => normalizePhone(s)),
    role: z.string().min(1, "Selecciona un rol").max(50),
    companyName: z.string().trim().max(120).optional(),
    avatar: z.string().url("La URL de la imagen debe ser válida").optional().or(z.literal("")),
  })
  .superRefine((data, ctx) => {
    if (data.role === "central" && (data.companyName?.trim().length ?? 0) < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "El nombre de empresa es obligatorio para cuentas Central",
        path: ["companyName"],
      });
    }
  });

export type AdminCreateUserInput = z.infer<typeof adminCreateUserSchema>;

/** Valida que el rol solicitado esté permitido según quien crea el usuario. */
export function assertRoleAllowedForCreator(
  role: string,
  creatorRole: string | undefined | null
): void {
  const code = role.trim().toLowerCase();
  if (isFullAdmin(creatorRole)) return;
  if ((FULL_ADMIN_ONLY_ASSIGN_ROLES as readonly string[]).includes(code)) {
    throw new Error("Solo el administrador puede asignar roles de administración o Soporte TI");
  }
  if ((STAFF_CREATABLE_ROLES as readonly string[]).includes(code)) return;
  // Roles personalizados del catálogo: permitidos para staff (no son admin/tiSupport)
}
