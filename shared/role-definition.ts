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

/** Roles que crea/actualiza el seeder (`npm run seed:roles`). */
export const SEEDED_SYSTEM_ROLE_CODES = ["admin", "client", "employee"] as const;

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

/** Textos y permisos por defecto para roles de sistema (códigos en inglés). */
export const SYSTEM_ROLE_CATALOG_DEFAULTS: RoleDefinitionDetail[] = [
  systemDetail(
    "admin",
    "Admin",
    "Full control of the Applia Store platform.",
    "Supervises operations, finances, verification, and global configuration.",
    1,
  ),
  systemDetail(
    "client",
    "Client",
    "User who shops in the Applia Store marketplace.",
    "Browses the storefront, places orders, and manages their purchases.",
    2,
  ),
  systemDetail(
    "employee",
    "Employee",
    "Store staff member assigned to a branch.",
    "Manages orders and branch chat for their assigned store location.",
    3,
  ),
];

export {
  countEnabledPermissions,
  systemRolePermissions,
  type RolePermissionKey,
  type RolePermissionsMap,
} from "./role-permissions";
