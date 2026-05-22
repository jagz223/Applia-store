import { isHiddenCatalogRoleCode } from "@shared/role-permissions";

export type CatalogRoleRow = {
  code: string;
  name: string;
  description?: string;
  isSystem?: boolean;
  sortOrder?: number;
  permissions?: Record<string, boolean>;
};

/** Excluye documentos técnicos (_seed, etc.) del catálogo visible. */
export function filterVisibleCatalogRoles<T extends { code?: string }>(roles: T[]): T[] {
  return roles.filter((r) => !isHiddenCatalogRoleCode(r.code));
}

export function normalizeCatalogRole<T extends { code?: string; name?: string }>(
  raw: T
): CatalogRoleRow | null {
  const code = String(raw?.code ?? "").trim().toLowerCase();
  if (isHiddenCatalogRoleCode(code)) return null;
  const name = String(raw?.name ?? code).trim() || code;
  return { ...raw, code, name } as CatalogRoleRow;
}
