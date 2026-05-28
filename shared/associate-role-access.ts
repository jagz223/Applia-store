import {
  ASSOCIATE_CENTRAL_PERMISSION_AREAS,
  type RolePermissionKey,
  type RolePermissionsMap,
} from "./role-permissions";
import { normalizeRoleCode } from "./roles";

/** Permisos del bloque «Asociado / Profesional» en el catálogo de roles. */
export const ASSOCIATE_ROLE_PERMISSION_KEYS = ASSOCIATE_CENTRAL_PERMISSION_AREAS[0].permissions.map(
  (p) => p.key as RolePermissionKey,
);

export function hasAssociatePermissionsInMap(
  permissions: RolePermissionsMap | Partial<Record<RolePermissionKey, boolean>> | null | undefined,
): boolean {
  if (!permissions || typeof permissions !== "object") return false;
  return ASSOCIATE_ROLE_PERMISSION_KEYS.some((k) => permissions[k] === true);
}

/**
 * Usuario que debe comportarse como asociado: rol sistema `professional`
 * o cualquier permiso del bloque asociado marcado en su rol.
 */
export function canActAsAssociate(
  roleCode: string | undefined | null,
  permissions: RolePermissionsMap | Partial<Record<RolePermissionKey, boolean>> | null | undefined,
): boolean {
  if (normalizeRoleCode(roleCode) === "professional") return true;
  return hasAssociatePermissionsInMap(permissions);
}

/** Debe completar Become Pro (sin perfil proveedor aún). */
export function shouldCompleteAssociateOnboarding(
  roleCode: string | undefined | null,
  permissions: RolePermissionsMap | Partial<Record<RolePermissionKey, boolean>> | null | undefined,
  hasProviderProfile: boolean,
): boolean {
  if (hasProviderProfile) return false;
  return canActAsAssociate(roleCode, permissions);
}
