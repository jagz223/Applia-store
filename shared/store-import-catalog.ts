import {
  buildStoreWhatsAppOrderMessage,
  type StoreWhatsAppOrderMessageInput,
} from "./store-whatsapp-order";

export const IMPORT_CATALOG_PAYMENT_LABEL = "Importar";

export const IMPORT_WHATSAPP_REDIRECT_NOTICE =
  "Te reenviaremos al chat de WhatsApp de la tienda con el pedido de importación para continuar la gestión.";

export type ImportWhatsAppOrderInput = Omit<
  StoreWhatsAppOrderMessageInput,
  "introLine" | "paymentMethodLabel" | "closingLine"
>;

export function buildImportWhatsAppOrderMessage(input: ImportWhatsAppOrderInput): string {
  return buildStoreWhatsAppOrderMessage({
    ...input,
    introLine: `Hola, quiero solicitar la importación de productos en ${input.storeName}.`,
    paymentMethodLabel: IMPORT_CATALOG_PAYMENT_LABEL,
    closingLine: "Quedo atento para continuar con la importación.",
  });
}
