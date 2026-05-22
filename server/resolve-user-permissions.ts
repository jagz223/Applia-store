import { resolveRolePermissions } from "@shared/role-permissions";
import { roleService } from "./services";

/** Permisos efectivos del usuario según su rol y el catálogo en Firestore. */
export async function resolveUserPermissions(roleCode: string | undefined | null) {
  const code = String(roleCode ?? "").trim().toLowerCase();
  if (!code) {
    return resolveRolePermissions("");
  }
  const def = await roleService.getRoleByCode(code);
  return resolveRolePermissions(code, def?.permissions ?? null);
}
