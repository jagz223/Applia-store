import { z } from "zod";
import {
  ALL_ROLE_PERMISSION_KEYS,
  countEnabledPermissions,
  systemRolePermissions,
  type RolePermissionKey,
  type RolePermissionsMap,
} from "./role-permissions";

/** Roles cuyo catálogo no puede modificarse (ni por administrador). */
export const IMMUTABLE_ROLE_CODES = ["admin"] as const;

export function isImmutableRoleCode(code: string): boolean {
  return (IMMUTABLE_ROLE_CODES as readonly string[]).includes(code.trim().toLowerCase());
}

const permissionsSchema = z
  .record(z.string(), z.boolean())
  .superRefine((perms, ctx) => {
    const hasAny = ALL_ROLE_PERMISSION_KEYS.some((key) => perms[key] === true);
    if (!hasAny) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Selecciona al menos un permiso en alguna sección (administración, asociado/central o cliente)",
        path: ["permissions"],
      });
    }
  });

export const roleCatalogFieldsSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(100),
  description: z
    .string()
    .min(10, "Describe el rol en al menos 10 caracteres")
    .max(300, "Máximo 300 caracteres"),
  responsibilities: z.string().max(500).optional(),
  permissions: permissionsSchema,
  sortOrder: z.coerce.number().int().min(0).optional(),
});

export const createRoleCatalogSchema = roleCatalogFieldsSchema.extend({
  code: z
    .string()
    .min(1, "El código es requerido")
    .max(50)
    .regex(/^[a-z][a-z0-9_]*$/, "Minúsculas: letras, números y guión bajo")
    .refine((c) => c !== "_seed" && !c.startsWith("_"), "Código reservado del sistema"),
});

export const updateRoleCatalogSchema = roleCatalogFieldsSchema.partial();

export type RoleCatalogFields = z.infer<typeof roleCatalogFieldsSchema>;

export type RoleDefinitionDetail = RoleCatalogFields & {
  code: string;
  isSystem?: boolean;
  sortOrder?: number;
};

function systemDetail(
  code: string,
  name: string,
  description: string,
  responsibilities: string,
  sortOrder: number
): RoleDefinitionDetail {
  return {
    code,
    name,
    description,
    responsibilities,
    permissions: systemRolePermissions(code),
    isSystem: true,
    sortOrder,
  };
}

/** Textos y permisos por defecto para roles de sistema. */
export const SYSTEM_ROLE_CATALOG_DEFAULTS: RoleDefinitionDetail[] = [
  systemDetail(
    "admin",
    "Administrador",
    "Control total de la plataforma GenFeb.",
    "Supervisa operación, finanzas, verificación y configuración global.",
    1
  ),
  systemDetail(
    "professional",
    "Profesional / Asociado",
    "Proveedor de servicios en el marketplace.",
    "Ofrece servicios y gestiona reservas como asociado.",
    2
  ),
  systemDetail(
    "client",
    "Cliente",
    "Usuario que contrata servicios en GenFeb.",
    "Busca y reserva servicios en la plataforma.",
    3
  ),
  systemDetail(
    "tiSupport",
    "Soporte TI",
    "Personal interno con acceso administrativo limitado.",
    "Soporte a usuarios sin acceso financiero ni gestión de roles.",
    4
  ),
  systemDetail(
    "central",
    "Central",
    "Empresa despachadora de conductores (Genfeb Go).",
    "Administra su empresa y conductores vinculados.",
    5
  ),
];

export {
  countEnabledPermissions,
  systemRolePermissions,
  type RolePermissionKey,
  type RolePermissionsMap,
} from "./role-permissions";
