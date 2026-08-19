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

export type StoreAccessContext = {
  store: Store;
  isOwner: boolean;
  isPlatformAdmin: boolean;
  isEmployee: boolean;
  employeeBranchId: string | null;
  canManageStaff: boolean;
  canFilterOrdersByBranch: boolean;
};

export async function resolveStoreAccess(
  viewerId: string | null | undefined,
  store: Store,
  jwtRole?: string | null,
): Promise<StoreAccessContext> {
  const isOwner = Boolean(viewerId && store.ownerUserId === viewerId);
  let isPlatformAdmin = hasAdminPrivileges(jwtRole);
  if (!isPlatformAdmin && viewerId) {
    const user = await appliaStorage.getUserById(viewerId);
    isPlatformAdmin = hasAdminPrivileges((user as { role?: string } | undefined)?.role);
  }

  let isEmployee = false;
  let employeeBranchId: string | null = null;
  if (viewerId && !isOwner && !isPlatformAdmin) {
    const staff = await appliaStorage.getStoreStaffMember(store.id, viewerId);
    if (staff?.role === "employee") {
      isEmployee = true;
      employeeBranchId = staff.branchId;
    }
  }

  const canManageStaff = isOwner || isPlatformAdmin;
  const canFilterOrdersByBranch = isOwner || isPlatformAdmin;

  return {
    store,
    isOwner,
    isPlatformAdmin,
    isEmployee,
    employeeBranchId,
    canManageStaff,
    canFilterOrdersByBranch,
  };
}

export async function requireStoreAccess(
  userId: string,
  storeId: number,
  jwtRole?: string | null,
): Promise<StoreAccessContext> {
  if (!userId) throw new Error("UNAUTHORIZED");
  const store = await appliaStorage.getStoreById(storeId);
  if (!store) throw new Error("STORE_NOT_FOUND");
  const access = await resolveStoreAccess(userId, store, jwtRole);
  if (!access.isOwner && !access.isPlatformAdmin && !access.isEmployee) {
    throw new Error("STORE_FORBIDDEN");
  }
  return access;
}

export async function requireStoreOwner(userId: string, storeId: number): Promise<Store> {
  if (!userId) throw new Error("UNAUTHORIZED");
  const store = await appliaStorage.getStoreById(storeId);
  if (!store) throw new Error("STORE_NOT_FOUND");
  const allowed = await viewerCanManageStore(userId, store);
  if (!allowed) throw new Error("STORE_FORBIDDEN");
  return store;
}

export async function requireStoreStaffManagement(
  userId: string,
  storeId: number,
  jwtRole?: string | null,
): Promise<StoreAccessContext> {
  const access = await requireStoreAccess(userId, storeId, jwtRole);
  if (!access.canManageStaff) throw new Error("STORE_FORBIDDEN");
  return access;
}

export function parsePositiveIntParam(raw: string | undefined): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) return null;
  return n;
}
