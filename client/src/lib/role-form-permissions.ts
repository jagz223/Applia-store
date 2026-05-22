import {
  ADMIN_SUITE_MASTER_KEY,
  isAdminSuiteEnabled,
  resolveRolePermissions,
  type RolePermissionKey,
  type RolePermissionsMap,
} from "@shared/role-permissions";

/** Permisos normalizados para el editor al crear/editar un rol en el catálogo. */
export function permissionsForRoleForm(
  roleCode: string,
  stored?: RolePermissionsMap | null
): Record<RolePermissionKey, boolean> {
  const perms = resolveRolePermissions(roleCode, stored);
  if (isAdminSuiteEnabled(perms) && !perms[ADMIN_SUITE_MASTER_KEY]) {
    perms[ADMIN_SUITE_MASTER_KEY] = true;
  }
  return perms;
}
