import { canActAsAssociate } from "@shared/associate-role-access";
import { canAccessCentralPanel, hasAdminPrivileges, isFullAdmin, normalizeRoleCode } from "@shared/roles";
import type { RolePermissionsMap } from "@shared/role-permissions";
import { api } from "@shared/routes";

/** Roles que no deben ver el CTA "Convertirse en Profesional" (salvo reglas especiales por rol). */
export const ROLES_HIDING_BECOME_PRO_CTA = ["tiSupport", "central"] as const;

/**
 * CTA «Convertirse en asociado»: usuarios con permisos de asociado (o admin) sin perfil proveedor.
 * Quienes ya tienen perfil usan «Panel asociado» / onboarding incompleto.
 */
export function shouldShowBecomeProCTA(
  user: { role?: string; provider?: unknown; permissions?: RolePermissionsMap } | null,
): boolean {
  if (!user?.role) return true;
  if (user.provider != null) return false;
  const role = normalizeRoleCode(user.role);
  if (role === "tisupport" || role === "central") return false;
  if (canActAsAssociate(user.role, user.permissions)) return true;
  if (role === "admin") return true;
  return !(ROLES_HIDING_BECOME_PRO_CTA as readonly string[]).includes(user.role);
}

/** Indica si el usuario tiene privilegios de administración (admin o Soporte TI). */
export function hasAdminRole(user: { role?: string } | null): boolean {
  return hasAdminPrivileges(user?.role);
}

/** Solo administrador (no Soporte TI): pestañas financieras y verificación de asociados. */
export function hasFullAdminRole(user: { role?: string } | null): boolean {
  return isFullAdmin(user?.role);
}

export function canAccessCentralDashboard(user: { role?: string } | null): boolean {
  return canAccessCentralPanel(user?.role);
}

/**
 * Ruta `/dashboard` (actividad / abono asociado): administrador, asociados con proveedor o rol asociado.
 * Excluye clientes puros y Soporte TI.
 */
export function canAccessAssociateActivityDashboard(
  user: { role?: string; provider?: unknown; permissions?: RolePermissionsMap } | null | undefined,
  hasProviderProfile: boolean,
): boolean {
  if (hasFullAdminRole(user ?? null)) return true;
  if (hasProviderProfile) return true;
  return canActAsAssociate(user?.role, user?.permissions);
}

/**
 * Panel `/dashboard` común: asociados/profesionales y también clientes (historial como cliente).
 */
export function canAccessActivityDashboard(
  user: { role?: string; provider?: unknown; permissions?: RolePermissionsMap } | null | undefined,
  hasProviderProfile: boolean,
): boolean {
  if (canAccessAssociateActivityDashboard(user, hasProviderProfile)) return true;
  const role = normalizeRoleCode(user?.role);
  return role === "client";
}

/**
 * Panel /promociones: admins, asociados con proveedor, profesionales y conductores Go (Car Go / delivery).
 */
export function canAccessPromocionesPanel(
  user: { role?: string; provider?: unknown } | null | undefined,
  hasProviderProfile: boolean,
  options?: { isGoVehicleProvider?: boolean },
): boolean {
  if (hasAdminPrivileges(user?.role)) return true;
  if (canAccessAssociateActivityDashboard(user, hasProviderProfile)) return true;
  if (options?.isGoVehicleProvider === true) return true;
  return false;
}

/**
 * Indica si el usuario es "invitado" (no autenticado).
 * Útil para rutas que solo deben mostrarse a usuarios no registrados (p. ej. registro, login).
 */
export function isGuest(user: { id?: string } | null): boolean {
  return !user;
}

export function isUnauthorizedError(error: Error): boolean {
  return /^401: .*Unauthorized/.test(error.message);
}

/**
 * Redirige al usuario a la pantalla de inicio con recarga completa.
 * Usado tras cerrar sesión para garantizar estado limpio (SOLID: regla en un solo lugar).
 */
export function redirectToHomeAfterLogout(): void {
  window.location.replace("/");
}

// Redirect to login with a toast notification
export function redirectToLogin(toast?: (options: { title: string; description: string; variant: string }) => void) {
  if (toast) {
    toast({
      title: "Unauthorized",
      description: "You are logged out. Logging in again...",
      variant: "destructive",
    });
  }
  setTimeout(() => {
    window.location.href = api.auth.replit.login.path;
  }, 500);
}
