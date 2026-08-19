import {
  displayUserName,
  matchesStoreStaffListFilters,
  type StoreStaffDirectoryEntry,
  type StoreStaffListFilters,
} from "@shared/store-staff-schema";
import { defaultStoreBranchName, normalizeStoreBranches, resolveStoreBranch, type Store } from "@shared/store-schema";
import { appliaStorage } from "./storage-applia";

export async function buildStoreStaffDirectory(
  store: Store,
  filters?: StoreStaffListFilters,
): Promise<StoreStaffDirectoryEntry[]> {
  const branches = normalizeStoreBranches(store.branches, store.location ?? null);
  const branchNameById = new Map(branches.map((b) => [b.id, b.name]));

  const [orders, staffMembers] = await Promise.all([
    appliaStorage.listStoreOrders(store.id),
    appliaStorage.listStoreStaffMembers(store.id),
  ]);

  const userIds = new Set<string>();
  for (const order of orders) {
    if (order.userId) userIds.add(order.userId);
  }
  for (const member of staffMembers) {
    userIds.add(member.userId);
  }

  const staffByUserId = new Map(staffMembers.map((m) => [m.userId, m]));
  const entries: StoreStaffDirectoryEntry[] = [];

  for (const userId of userIds) {
    const user = (await appliaStorage.getUserById(userId)) as
      | {
          email?: string;
          phone?: string;
          name?: string;
          firstName?: string;
          lastName?: string;
        }
      | undefined;
    if (!user?.email) continue;

    const staff = staffByUserId.get(userId);
    const role = staff?.role === "employee" ? "employee" : "client";
    const branchId = role === "employee" ? staff?.branchId ?? null : null;
    const branchName =
      branchId != null
        ? resolveStoreBranch(branches, branchId)?.name ?? branchNameById.get(branchId) ?? defaultStoreBranchName(0)
        : null;

    const entry: StoreStaffDirectoryEntry = {
      userId,
      email: user.email,
      name: displayUserName(user),
      phone: user.phone?.trim() || null,
      role,
      branchId,
      branchName,
    };

    if (matchesStoreStaffListFilters(entry, filters)) {
      entries.push(entry);
    }
  }

  return entries.sort((a, b) => {
    const emailCmp = a.email.localeCompare(b.email, "es");
    if (emailCmp !== 0) return emailCmp;
    return a.userId.localeCompare(b.userId);
  });
}
