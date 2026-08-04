import type { Store } from "@shared/store-schema";
import { hasAdminPrivileges } from "@shared/roles";
import { appliaStorage } from "./storage-applia";

/** Dueño de la tienda o admin/staff pueden gestionarla. */
export async function viewerCanManageStore(
  viewerId: string | null | undefined,
  store: Pick<Store, "ownerUserId">,
  jwtRole?: string | null,
): Promise<boolean> {
  if (!viewerId) return false;
  if (store.ownerUserId === viewerId) return true;
  if (hasAdminPrivileges(jwtRole)) return true;
  const user = await appliaStorage.getUserById(viewerId);
  return hasAdminPrivileges((user as { role?: string } | undefined)?.role);
}

export async function requireStoreOwner(userId: string, storeId: number): Promise<Store> {
  if (!userId) throw new Error("UNAUTHORIZED");
  const store = await appliaStorage.getStoreById(storeId);
  if (!store) throw new Error("STORE_NOT_FOUND");
  const allowed = await viewerCanManageStore(userId, store);
  if (!allowed) throw new Error("STORE_FORBIDDEN");
  return store;
}

export function parsePositiveIntParam(raw: string | undefined): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) return null;
  return n;
}
