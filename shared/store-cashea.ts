import { STORE_FULFILLMENT_LABELS, type StoreFulfillmentMode } from "./store-fulfillment";

export const CASHEA_PAYMENT_METHOD_SYSTEM_KIND = "cashea";
export const CASHEA_PAYMENT_METHOD_NAME = "Cashea";

export const CASHEA_ACTIVATION_NOTICE =
  "Actualmente no está disponible una conexión directa con Cashea, por lo que al activar esta opción, si los clientes la seleccionan se les permitirá enviar un mensaje al WhatsApp con el pedido.";

export const CASHEA_WHATSAPP_REDIRECT_NOTICE =
  "Te reenviaremos al chat de WhatsApp de la tienda con el pedido que tienes para proceder con el pago por medio de Cashea.";

export type CasheaWhatsAppOrderInput = {
  storeName: string;
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  fulfillmentMode: StoreFulfillmentMode | null;
  fulfillmentLabel?: string | null;
  branchName?: string | null;
  branchAddress?: string | null;
  deliveryLocation?: { label: string; lat?: number; lon?: number } | null;
  customerNote?: string | null;
  items: Array<{ quantity: number; name: string; lineTotal: number }>;
  subtotal: number;
  deliveryFee?: number | null;
  total: number;
};

function formatMoney(value: number): string {
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(value);
}

export function buildCasheaWhatsAppOrderMessage(input: CasheaWhatsAppOrderInput): string {
  const lines: string[] = [
    `Hola, quiero pagar con Cashea en ${input.storeName}.`,
    "",
    "— Pedido —",
  ];

  for (const item of input.items) {
    lines.push(`${item.quantity}× ${item.name} — ${formatMoney(item.lineTotal)}`);
  }

  lines.push("");
  lines.push(`Subtotal: ${formatMoney(input.subtotal)}`);
  if (input.deliveryFee != null && input.deliveryFee > 0) {
    lines.push(`Envío: ${formatMoney(input.deliveryFee)}`);
  }
  lines.push(`Total: ${formatMoney(input.total)}`);
  lines.push("");
  lines.push("— Cliente —");
  lines.push(`Nombre: ${input.customerName}`);
  if (input.customerEmail?.trim()) lines.push(`Correo: ${input.customerEmail.trim()}`);
  if (input.customerPhone?.trim()) lines.push(`Teléfono: ${input.customerPhone.trim()}`);

  lines.push("");
  lines.push("— Entrega —");
  const mode = input.fulfillmentMode;
  const modeLabel =
    input.fulfillmentLabel?.trim() ||
    (mode ? STORE_FULFILLMENT_LABELS[mode] : "Sin especificar");

  if (mode === "delivery") {
    lines.push(`Modalidad: Delivery (${modeLabel})`);
    if (input.deliveryLocation?.label?.trim()) {
      lines.push(`Ubicación de entrega: ${input.deliveryLocation.label.trim()}`);
    }
    if (
      input.deliveryLocation?.lat != null &&
      input.deliveryLocation?.lon != null &&
      Number.isFinite(input.deliveryLocation.lat) &&
      Number.isFinite(input.deliveryLocation.lon)
    ) {
      lines.push(
        `Coordenadas: ${input.deliveryLocation.lat.toFixed(5)}, ${input.deliveryLocation.lon.toFixed(5)}`,
      );
    }
  } else if (mode === "pickup") {
    lines.push(`Modalidad: Recoger en sucursal (${modeLabel})`);
    if (input.branchName?.trim()) lines.push(`Sucursal: ${input.branchName.trim()}`);
    if (input.branchAddress?.trim()) lines.push(`Dirección: ${input.branchAddress.trim()}`);
  } else if (mode === "in_site") {
    lines.push(`Modalidad: Consumir en local (${modeLabel})`);
    if (input.branchName?.trim()) lines.push(`Sucursal: ${input.branchName.trim()}`);
    if (input.branchAddress?.trim()) lines.push(`Dirección: ${input.branchAddress.trim()}`);
  } else {
    lines.push(`Modalidad: ${modeLabel}`);
  }

  if (input.customerNote?.trim()) {
    lines.push("");
    lines.push("— Indicaciones del pedido —");
    lines.push(input.customerNote.trim());
  }

  lines.push("");
  lines.push("Método de pago: Cashea");
  lines.push("Quedo atento para continuar con el pago.");

  return lines.join("\n");
}

export function isCasheaPaymentMethod(method: {
  systemKind?: string | null;
  name?: string | null;
}): boolean {
  const kind = String(method.systemKind ?? "").trim().toLowerCase();
  if (kind === CASHEA_PAYMENT_METHOD_SYSTEM_KIND) return true;
  return String(method.name ?? "").trim().toLowerCase() === CASHEA_PAYMENT_METHOD_NAME.toLowerCase();
}
