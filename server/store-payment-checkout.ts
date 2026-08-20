import type { StorePaymentGatewayKind } from "@shared/store-payment-gateways";
import { STORE_PAYMENT_GATEWAY_LABELS } from "@shared/store-payment-gateways";
import { createStoreDlocalGoPayment, isDlocalGoConfigured } from "./dlocalgo";
import { createPayPalOrder, isPayPalConfigured } from "./paypal";
import { createStoreStripeCheckoutSession, isStripeConfigured } from "./stripe";

export function getStorePaymentsOrigin(): string {
  const explicit =
    process.env.FRONTEND_URL?.trim() ||
    process.env.PUBLIC_SITE_URL?.trim() ||
    process.env.APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const port = process.env.PORT || "5000";
  return `http://localhost:${port}`;
}

/** Tras pago OK → pedidos del usuario. */
export function storePaymentsSuccessUrl(orderId: number): string {
  return `${getStorePaymentsOrigin()}/pedidos-tienda?orderId=${orderId}&pago=ok`;
}

/** Cancelación / fallo → vitrina de la tienda. */
export function storePaymentsCancelUrl(storeSlug: string): string {
  const slug = storeSlug.trim();
  const origin = getStorePaymentsOrigin();
  if (!slug) return `${origin}/tienda?pago=cancelado`;
  return `${origin}/tienda/${encodeURIComponent(slug)}?pago=cancelado`;
}

export function assertStorePaymentGatewayConfigured(kind: StorePaymentGatewayKind): void {
  if (kind === "stripe" && !isStripeConfigured()) {
    throw new Error("STRIPE_NOT_CONFIGURED");
  }
  if (kind === "paypal" && !isPayPalConfigured()) {
    throw new Error("PAYPAL_NOT_CONFIGURED");
  }
  if (kind === "dlocalgo" && !isDlocalGoConfigured()) {
    throw new Error("DLOCALGO_NOT_CONFIGURED");
  }
}

export async function createStoreGatewayCheckout(params: {
  kind: StorePaymentGatewayKind;
  amount: number;
  pendingCheckoutId: string;
  storeId: number;
  storeName: string;
  storeSlug: string;
  payer?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  };
}): Promise<{ checkoutUrl: string; reference: string; gatewayKind: StorePaymentGatewayKind }> {
  const storeName = params.storeName.trim() || "Tienda";
  const origin = getStorePaymentsOrigin();
  const cancelUrl = storePaymentsCancelUrl(params.storeSlug);

  switch (params.kind) {
    case "stripe": {
      const session = await createStoreStripeCheckoutSession({
        amount: params.amount,
        currency: "usd",
        pendingCheckoutId: params.pendingCheckoutId,
        storeId: params.storeId,
        storeName,
        successUrl: `${origin}/api/store-payments/stripe/return?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl,
      });
      return {
        checkoutUrl: session.url,
        reference: `stripe:${session.sessionId}`,
        gatewayKind: "stripe",
      };
    }
    case "paypal": {
      const order = await createPayPalOrder(
        params.amount,
        "USD",
        `Pago · ${storeName}`,
        params.pendingCheckoutId.slice(0, 256),
        {
          returnUrl: `${origin}/api/store-payments/paypal/return?pendingId=${encodeURIComponent(params.pendingCheckoutId)}`,
          cancelUrl: `${origin}/api/store-payments/paypal/cancel?storeSlug=${encodeURIComponent(params.storeSlug.trim())}`,
        },
      );
      if (!order.approvalUrl) {
        throw new Error("PAYPAL_APPROVAL_URL_MISSING");
      }
      if (/stripe\.com/i.test(order.approvalUrl)) {
        throw new Error("PAYPAL_RETURNED_STRIPE_URL");
      }
      return {
        checkoutUrl: order.approvalUrl,
        reference: `paypal:${order.orderId}`,
        gatewayKind: "paypal",
      };
    }
    case "dlocalgo": {
      const payment = await createStoreDlocalGoPayment({
        amount: params.amount,
        orderId: 0,
        storeId: params.storeId,
        storeName,
        successUrl: `${origin}/api/store-payments/dlocalgo/return?pendingId=${encodeURIComponent(params.pendingCheckoutId)}`,
        backUrl: cancelUrl,
        payer: params.payer,
      });
      return {
        checkoutUrl: payment.checkoutUrl,
        reference: `dlocalgo:${payment.paymentId}`,
        gatewayKind: "dlocalgo",
      };
    }
    default: {
      const _exhaustive: never = params.kind;
      throw new Error(`Pasarela no soportada: ${String(_exhaustive)}`);
    }
  }
}

export function storeGatewayNotConfiguredMessage(kind: StorePaymentGatewayKind): string {
  if (kind === "stripe") {
    return "Stripe no está configurado. Agrega STRIPE_SECRET_KEY en el .env.";
  }
  if (kind === "paypal") {
    return "PayPal no está configurado. Agrega PAYPAL_CLIENT_ID y PAYPAL_CLIENT_SECRET en el .env.";
  }
  return "dLocal Go no está configurado. Agrega DLOCALGO_API_KEY y DLOCALGO_SECRET_KEY en el .env.";
}

export function storeGatewayProofPlaceholder(kind: StorePaymentGatewayKind): string {
  return `Pasarela ${STORE_PAYMENT_GATEWAY_LABELS[kind]}`;
}
