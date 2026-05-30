import type { Store } from "@shared/store-schema";
import { genFebStorage } from "./storage-genfeb";

export async function requireStoreOwner(userId: string, storeId: number): Promise<Store> {
  if (!userId) throw new Error("UNAUTHORIZED");
  const store = await genFebStorage.getStoreById(storeId);
  if (!store) throw new Error("STORE_NOT_FOUND");
  if (store.ownerUserId !== userId) throw new Error("STORE_FORBIDDEN");
  return store;
}

export function parsePositiveIntParam(raw: string | undefined): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) return null;
  return n;
}
