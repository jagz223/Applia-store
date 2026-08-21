import { z } from "zod";
import type { StoreOrderStatus } from "@shared/store-order-schema";
import type { StoreBranch } from "@shared/store-schema";
import { defaultStoreBranchName, resolveStoreBranch } from "@shared/store-schema";

export const STORE_ORDER_CUSTOMER_CHAT_KIND = "store_order_customer";
/** @deprecated Usar {@link STORE_BRANCH_PAIR_CHAT_KIND} (un hilo por par de sucursales). */
export const STORE_BRANCH_COORDINATION_CHAT_KIND = "store_branch_coordination";
export const STORE_BRANCH_PAIR_CHAT_KIND = "store_branch_pair";

export const STORE_ORDER_CUSTOMER_CHAT_GRACE_MS = 24 * 60 * 60 * 1000;

const ACTIVE_ORDER_STATUSES: StoreOrderStatus[] = [
  "pagado",
  "confirmado",
  "listo_para_envio",
  "enviado",
  "listo_pickup",
  "listo_local",
];

export function isStoreOrderCustomerChatAvailable(order: {
  status: StoreOrderStatus;
  updatedAt: Date | string;
}): boolean {
  if (order.status === "rechazado") return false;
  if (ACTIVE_ORDER_STATUSES.includes(order.status)) return true;
  if (order.status !== "completado") return false;
  const endedAt = new Date(order.updatedAt).getTime();
  if (Number.isNaN(endedAt)) return false;
  return Date.now() - endedAt <= STORE_ORDER_CUSTOMER_CHAT_GRACE_MS;
}

export const storeChatSendMessageSchema = z.object({
  content: z.string().trim().min(1).max(4000),
  type: z.enum(["text", "image", "location"]).optional().default("text"),
});

export type StoreChatSendMessageInput = z.infer<typeof storeChatSendMessageSchema>;

export const storeStartCustomerChatSchema = z.object({
  orderId: z.coerce.number().int().positive(),
  branchId: z.string().trim().min(1).max(64).optional(),
});

export type StoreStartCustomerChatInput = z.infer<typeof storeStartCustomerChatSchema>;

export type StoreBranchPair = {
  branchIdA: string;
  branchIdB: string;
  branchNameA: string;
  branchNameB: string;
};

/** Orden canónico de ids de sucursal para un par (A < B). */
export function normalizeStoreBranchPairIds(branchIdA: string, branchIdB: string): [string, string] {
  const a = branchIdA.trim();
  const b = branchIdB.trim();
  return a.localeCompare(b) <= 0 ? [a, b] : [b, a];
}

/** Todas las combinaciones únicas de sucursales (n ≥ 2). */
export function listStoreBranchPairs(branches: StoreBranch[]): StoreBranchPair[] {
  const list = branches.filter((b) => b.id?.trim());
  const pairs: StoreBranchPair[] = [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const [branchIdA, branchIdB] = normalizeStoreBranchPairIds(list[i].id, list[j].id);
      const branchA = resolveStoreBranch(branches, branchIdA);
      const branchB = resolveStoreBranch(branches, branchIdB);
      pairs.push({
        branchIdA,
        branchIdB,
        branchNameA: branchA?.name?.trim() || defaultStoreBranchName(0),
        branchNameB: branchB?.name?.trim() || defaultStoreBranchName(1),
      });
    }
  }
  return pairs;
}

export function storeBranchPairTitle(branchNameA: string, branchNameB: string): string {
  return `${branchNameA} ↔ ${branchNameB}`;
}

export function userCanAccessStoreBranchPairChat(
  branchIdA: string,
  branchIdB: string,
  access: { isOwner?: boolean; isPlatformAdmin?: boolean; isEmployee?: boolean; employeeBranchId?: string | null },
): boolean {
  if (access.isOwner || access.isPlatformAdmin) return true;
  if (!access.isEmployee || !access.employeeBranchId) return false;
  const mine = access.employeeBranchId.trim();
  return mine === branchIdA.trim() || mine === branchIdB.trim();
}

export type StoreChatListItemKind =
  | typeof STORE_BRANCH_PAIR_CHAT_KIND
  | typeof STORE_ORDER_CUSTOMER_CHAT_KIND;

export type StoreChatListItem = {
  id: number;
  kind: StoreChatListItemKind;
  title: string;
  subtitle?: string | null;
  lastMessageText?: string | null;
  lastMessageAt?: string | null;
  branchIdA?: string | null;
  branchIdB?: string | null;
  branchId?: string | null;
  branchName?: string | null;
  storeOrderId?: number | null;
  customerName?: string | null;
  chatLocked?: boolean;
};
