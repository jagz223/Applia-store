/**
 * Roles con los mismos privilegios que el administrador (panel, APIs admin, notificaciones internas).
 * Mantener sincronizado con el catálogo en Firestore / seed (code: tiSupport, name: Soporte TI).
 */
export const ADMIN_PRIVILEGE_ROLES = ["admin", "tiSupport"] as const;

export type AdminPrivilegeRole = (typeof ADMIN_PRIVILEGE_ROLES)[number];

/** Normaliza el código de rol (JWT/Firestore pueden variar en mayúsculas o espacios). */
export function normalizeRoleCode(role: string | undefined | null): string | null {
  if (role == null) return null;
  if (typeof role === "object") {
    const code = (role as { code?: string }).code;
    if (typeof code === "string") return normalizeRoleCode(code);
    return null;
  }
  if (typeof role !== "string") return null;
  const t = role.trim();
  if (!t) return null;
  const lower = t.toLowerCase();
  if (lower === "admin") return "admin";
  // tiSupport / Soporte TI / tisupport / ti_support / ti-support / "ti support"
  const compact = lower.replace(/[\s_-]/g, "");
  if (compact === "tisupport" || t === "Soporte TI") return "tiSupport";
  return t;
}

export function hasAdminPrivileges(role: string | undefined | null): boolean {
  const n = normalizeRoleCode(role);
  if (!n) return false;
  if (n === "admin" || n === "tiSupport") return true;
  return (ADMIN_PRIVILEGE_ROLES as readonly string[]).includes(n);
}

/**
 * Solo el rol `admin` (no Soporte TI): gestión financiera, asociados (verificación),
 * recargas, saldo y retiros.
 */
export function isFullAdmin(role: string | undefined | null): boolean {
  return normalizeRoleCode(role) === "admin";
}
