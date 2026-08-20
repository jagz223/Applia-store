export const STORE_PAYMENT_GATEWAY_KINDS = ["stripe", "paypal", "dlocalgo"] as const;

export type StorePaymentGatewayKind = (typeof STORE_PAYMENT_GATEWAY_KINDS)[number];

export const STORE_PAYMENT_GATEWAY_LABELS: Record<StorePaymentGatewayKind, string> = {
  stripe: "Stripe",
  paypal: "PayPal",
  dlocalgo: "dLocal Go",
};

export function parseStorePaymentGatewayKind(value: unknown): StorePaymentGatewayKind | null {
  const kind = String(value ?? "")
    .trim()
    .toLowerCase();
  if (kind === "stripe" || kind === "paypal" || kind === "dlocalgo") return kind;
  return null;
}

export function isStorePaymentGatewayMethod(method: { systemKind?: string | null; gatewayKind?: string | null }): boolean {
  return parseStorePaymentGatewayKind(method.gatewayKind ?? method.systemKind) != null;
}

export function storePaymentGatewayLabel(kind: StorePaymentGatewayKind | null | undefined): string {
  if (!kind) return "";
  return STORE_PAYMENT_GATEWAY_LABELS[kind];
}
