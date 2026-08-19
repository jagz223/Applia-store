import {
  CASHEA_PAYMENT_METHOD_NAME,
  CASHEA_PAYMENT_METHOD_SYSTEM_KIND,
} from "@shared/store-cashea";
import type { StorePaymentMethod } from "@shared/store-payment-method-schema";
import type { IStorage } from "./storage-applia";

export async function findStoreCasheaPaymentMethod(
  storage: IStorage,
  storeId: number,
): Promise<StorePaymentMethod | undefined> {
  const methods = await storage.listStorePaymentMethods(storeId);
  return methods.find((m) => m.systemKind === CASHEA_PAYMENT_METHOD_SYSTEM_KIND);
}

export async function syncStoreCasheaPaymentMethod(
  storage: IStorage,
  storeId: number,
  enabled: boolean,
): Promise<void> {
  const existing = await findStoreCasheaPaymentMethod(storage, storeId);
  if (!enabled) {
    if (existing) await storage.deleteStorePaymentMethod(storeId, existing.id);
    return;
  }
  if (existing) return;
  await storage.createStorePaymentMethod(storeId, {
    name: CASHEA_PAYMENT_METHOD_NAME,
    accountNumber: "",
    extraFields: [],
    imageUrl: null,
    systemKind: CASHEA_PAYMENT_METHOD_SYSTEM_KIND,
  });
}
