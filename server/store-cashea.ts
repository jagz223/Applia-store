import {
  CASHEA_PAYMENT_METHOD_NAME,
  CASHEA_PAYMENT_METHOD_SYSTEM_KIND,
  CASHEA_REQUIRES_WHATSAPP_MESSAGE,
} from "@shared/store-cashea";
import { normalizeStoreWhatsappPhone } from "@shared/store-whatsapp";
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

/** Cashea solo puede quedar activo si la tienda tiene WhatsApp válido. */
export function prepareCasheaEnabledForStoreUpdate(opts: {
  currentWhatsappPhone: string | null | undefined;
  nextWhatsappPhone: string | null | undefined;
  whatsappPhoneInPatch: boolean;
  currentCasheaEnabled: boolean;
  casheaEnabledInPatch: boolean | undefined;
}): { ok: true; casheaEnabled?: boolean } | { ok: false; message: string } {
  const nextPhone = opts.whatsappPhoneInPatch ? opts.nextWhatsappPhone : opts.currentWhatsappPhone;
  const wantsCashea =
    opts.casheaEnabledInPatch !== undefined ? opts.casheaEnabledInPatch : opts.currentCasheaEnabled;
  if (wantsCashea && !normalizeStoreWhatsappPhone(nextPhone)) {
    if (opts.casheaEnabledInPatch === true) {
      return { ok: false, message: CASHEA_REQUIRES_WHATSAPP_MESSAGE };
    }
    return { ok: true, casheaEnabled: false };
  }
  return { ok: true };
}
