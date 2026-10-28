import {
  buildStoreWhatsAppOrderMessage,
  type StoreWhatsAppOrderMessageInput,
} from "./store-whatsapp-order";

export const CASHEA_PAYMENT_METHOD_SYSTEM_KIND = "cashea";
export const CASHEA_PAYMENT_METHOD_NAME = "Cashea";

export const CASHEA_ACTIVATION_NOTICE =
  "Actualmente no está disponible una conexión directa con Cashea, por lo que al activar esta opción, si los clientes la seleccionan se les permitirá enviar un mensaje al WhatsApp con el pedido.";

export const CASHEA_REQUIRES_WHATSAPP_MESSAGE =
  "Para activar Cashea, primero asigna un número de WhatsApp a la tienda en Configuraciones de tienda.";

export const CASHEA_WHATSAPP_REDIRECT_NOTICE =
  "Te reenviaremos al chat de WhatsApp de la tienda con el pedido que tienes para proceder con el pago por medio de Cashea.";

export type CasheaWhatsAppOrderInput = Omit<
  StoreWhatsAppOrderMessageInput,
  "introLine" | "paymentMethodLabel" | "closingLine"
>;

export function buildCasheaWhatsAppOrderMessage(input: CasheaWhatsAppOrderInput): string {
  return buildStoreWhatsAppOrderMessage({
    ...input,
    introLine: `Hola, quiero pagar con Cashea en ${input.storeName}.`,
    paymentMethodLabel: "Cashea",
    closingLine: "Quedo atento para continuar con el pago.",
  });
}

export function isCasheaPaymentMethod(method: {
  systemKind?: string | null;
  name?: string | null;
}): boolean {
  const kind = String(method.systemKind ?? "").trim().toLowerCase();
  if (kind === CASHEA_PAYMENT_METHOD_SYSTEM_KIND) return true;
  return String(method.name ?? "").trim().toLowerCase() === CASHEA_PAYMENT_METHOD_NAME.toLowerCase();
}
