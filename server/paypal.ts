/**
 * Integración con PayPal para pagos
 * Applia
 */

function paypalClientId(): string {
  return (process.env.PAYPAL_CLIENT_ID ?? "").trim();
}

function paypalClientSecret(): string {
  return (process.env.PAYPAL_CLIENT_SECRET ?? "").trim();
}

function paypalMode(): string {
  return (process.env.PAYPAL_MODE || "sandbox").trim().toLowerCase();
}

const PLACEHOLDER_PAYPAL_IDS = new Set(["your-paypal-client-id", "your_paypal_client_id"]);
const PLACEHOLDER_PAYPAL_SECRETS = new Set(["your-paypal-client-secret", "your_paypal_client_secret"]);

export function isPayPalConfigured(): boolean {
  const id = paypalClientId();
  const secret = paypalClientSecret();
  return Boolean(id && secret && !PLACEHOLDER_PAYPAL_IDS.has(id) && !PLACEHOLDER_PAYPAL_SECRETS.has(secret));
}

function paypalApiBase(): string {
  return paypalMode() === "live" || paypalMode() === "production"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

/**
 * Obtiene el token de acceso de PayPal
 */
async function getAccessToken(): Promise<string> {
  if (!isPayPalConfigured()) {
    throw new Error("PAYPAL_NOT_CONFIGURED");
  }

  const auth = Buffer.from(`${paypalClientId()}:${paypalClientSecret()}`).toString("base64");

  const response = await fetch(`${paypalApiBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    throw new Error("Failed to obtain PayPal access token");
  }

  const data = await response.json();
  return data.access_token;
}

export type CreatePayPalOrderUrls = {
  returnUrl?: string;
  cancelUrl?: string;
};

/**
 * Crea una orden de PayPal
 */
export async function createPayPalOrder(
  amount: number,
  currency: string = "USD",
  description: string,
  bookingId: string,
  urls?: CreatePayPalOrderUrls,
): Promise<{ orderId: string; approvalUrl: string }> {
  const accessToken = await getAccessToken();
  const origin = (process.env.FRONTEND_URL || process.env.PUBLIC_SITE_URL || "http://localhost:5000").replace(
    /\/$/,
    "",
  );

  const response = await fetch(`${paypalApiBase()}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: bookingId.slice(0, 256),
          description,
          amount: {
            currency_code: currency,
            value: amount.toFixed(2),
          },
        },
      ],
      application_context: {
        brand_name: "Applia",
        landing_page: "BILLING",
        user_action: "PAY_NOW",
        return_url: urls?.returnUrl || `${origin}/payments/success`,
        cancel_url: urls?.cancelUrl || `${origin}/payments/cancel`,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`PayPal order creation failed: ${error}`);
  }

  const data = await response.json();

  const approvalUrl = data.links?.find((link: { rel?: string; href?: string }) => link.rel === "approve")?.href || "";

  return {
    orderId: data.id,
    approvalUrl,
  };
}

/**
 * Captura una orden de PayPal (confirma el pago)
 */
export async function capturePayPalOrder(orderId: string): Promise<{
  status: string;
  payerEmail?: string;
  transactionId: string;
}> {
  const accessToken = await getAccessToken();

  const response = await fetch(`${paypalApiBase()}/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`PayPal capture failed: ${error}`);
  }

  const data = await response.json();
  
  const purchaseUnit = data.purchase_units?.[0];
  const capture = purchaseUnit?.payments?.captures?.[0];

  return {
    status: data.status,
    payerEmail: data.payer?.email_address,
    transactionId: capture?.id || "",
  };
}

/**
 * Obtiene los detalles de una orden de PayPal
 */
export async function getPayPalOrderDetails(orderId: string): Promise<any> {
  const accessToken = await getAccessToken();

  const response = await fetch(`${paypalApiBase()}/v2/checkout/orders/${orderId}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to get PayPal order details");
  }

  return response.json();
}

/**
 * Reembolsa un pago de PayPal
 */
export async function refundPayPalPayment(
  captureId: string,
  amount?: number,
  reason?: string
): Promise<{ refundId: string; status: string }> {
  const accessToken = await getAccessToken();

  const body: Record<string, unknown> = {};
  if (amount) {
    body.amount = {
      value: amount.toFixed(2),
      currency_code: "USD",
    };
  }
  if (reason) {
    body.note_to_payer = reason;
  }

  const response = await fetch(
    `${paypalApiBase()}/v2/payments/captures/${captureId}/refund`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`PayPal refund failed: ${error}`);
  }

  const data = await response.json();

  return {
    refundId: data.id,
    status: data.status,
  };
}

/**
 * Crea un enlace de pago PayPal para escrow
 */
export async function createEscrowPaymentLink(
  amount: number,
  bookingId: string,
  serviceName: string,
  clientEmail: string,
  providerEmail: string
): Promise<{ escrowLink: string; orderId: string }> {
  // En una implementación real, esto crearía un payment hold
  // Por ahora, usamos el flujo estándar de PayPal
  
  const order = await createPayPalOrder(
    amount,
    "USD",
    `Reserva de servicio: ${serviceName}`,
    bookingId
  );

  return {
    escrowLink: order.approvalUrl,
    orderId: order.orderId,
  };
}
