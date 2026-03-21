import { hasAdminPrivileges, isFullAdmin } from "@shared/roles";
import { api } from "@shared/routes";

/** Roles que no deben ver el CTA "Convertirse en Profesional" (salvo reglas especiales por rol). */
export const ROLES_HIDING_BECOME_PRO_CTA = ["professional", "tiSupport"] as const;

/**
 * Indica si debe mostrarse el CTA de "Convertirse en Profesional".
 * - Profesional: no (ya es asociado).
 * - Admin: sí si aún no tiene perfil proveedor; puede ser asociado sin perder rol admin.
 * - Soporte TI: no (misma política que antes).
 */
export function shouldShowBecomeProCTA(user: { role?: string; provider?: unknown } | null): boolean {
  if (!user?.role) return true;
  if (user.role === "professional") return false;
  if (user.role === "admin") {
    return user.provider == null;
  }
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
