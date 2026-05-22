import { normalizeRoleCode } from "@shared/roles";

export type AdminUserDetail = {
  id: string;
  name?: string;
  lastName?: string;
  email?: string;
  phone?: string | null;
  role?: string;
  providerId?: number | null;
};

export function isAssociateUserRole(role: string | undefined | null): boolean {
  return normalizeRoleCode(role) === "professional";
}

export function adminProviderEditHref(
  providerId: number,
  returnPath = "/admin?tab=users"
): string {
  return `/admin/providers/${providerId}?return=${encodeURIComponent(returnPath)}`;
}

export function adminUsersTabEditHref(userId: string): string {
  return `/admin?tab=users&editUser=${encodeURIComponent(userId)}`;
}
