import {
  hasRolePermission,
  isAdminSuiteEnabled,
  resolveRolePermissions,
  type RolePermissionKey,
  type RolePermissionsMap,
} from "@shared/role-permissions";
import { hasAdminPrivileges, isFullAdmin, isCentralRole } from "@shared/roles";

export type AuthUserWithPermissions = {
  role?: string;
  permissions?: RolePermissionsMap;
};

export function getUserPermissions(user: AuthUserWithPermissions | null | undefined) {
  if (user?.permissions && Object.keys(user.permissions).length > 0) {
    return resolveRolePermissions(user.role ?? "", user.permissions);
  }
  return resolveRolePermissions(user?.role ?? "");
}

export function userCan(
  user: AuthUserWithPermissions | null | undefined,
  key: RolePermissionKey
): boolean {
  return hasRolePermission(getUserPermissions(user), key);
}

/** Panel admin: suite administrativa + acceso al panel, o roles legacy staff. */
export function canAccessAdminPanel(user: AuthUserWithPermissions | null | undefined): boolean {
  const perms = getUserPermissions(user);
  if (isAdminSuiteEnabled(perms) && hasRolePermission(perms, "admin.panel")) return true;
  return hasAdminPrivileges(user?.role);
}

export function canAccessCentralDashboard(user: AuthUserWithPermissions | null | undefined): boolean {
  if (userCan(user, "central.panel")) return true;
  return isCentralRole(user?.role) || hasAdminPrivileges(user?.role);
}

export function canAccessAssociateDashboard(user: AuthUserWithPermissions | null | undefined): boolean {
  if (userCan(user, "associate.dashboard")) return true;
  if (isFullAdmin(user?.role)) return true;
  return false;
}

export function canFullAdminFinance(user: AuthUserWithPermissions | null | undefined): boolean {
  if (isFullAdmin(user?.role)) return true;
  const perms = getUserPermissions(user);
  return (
    hasRolePermission(perms, "admin.stats") ||
    hasRolePermission(perms, "admin.recharges") ||
    hasRolePermission(perms, "admin.payouts")
  );
}
