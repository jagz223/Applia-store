/**
 * Integración con PayPal para pagos
 * GenFeb
 */

const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID || "your-paypal-client-id";
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET || "your-paypal-client-secret";
const PAYPAL_MODE = process.env.PAYPAL_MODE || "sandbox";

const PAYPAL_API_BASE = PAYPAL_MODE === "production" 
  ? "https://api-m.paypal.com" 
  : "https://api-m.sandbox.paypal.com";

/**
 * Obtiene el token de acceso de PayPal
 */
async function getAccessToken(): Promise<string> {
  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString("base64");
  
  const response = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${auth}`,
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

/**
 * Crea una orden de PayPal
 */
export async function createPayPalOrder(
  amount: number,
  currency: string = "USD",
  description: string,
  bookingId: string
): Promise<{ orderId: string; approvalUrl: string }> {
  const accessToken = await getAccessToken();

  const response = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: bookingId,
          description: description,
          amount: {
            currency_code: currency,
            value: amount.toFixed(2),
          },
        },
      ],
      application_context: {
        brand_name: "GenFeb",
        landing_page: "BILLING",
        user_action: "PAY_NOW",
        return_url: `${process.env.FRONTEND_URL || "http://localhost:5000"}/payments/success`,
        cancel_url: `${process.env.FRONTEND_URL || "http://localhost:5000"}/payments/cancel`,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`PayPal order creation failed: ${error}`);
  }

  const data = await response.json();
  
  // Find the approval URL
  const approvalUrl = data.links?.find((link: any) => link.rel === "approve")?.href || "";

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

  const response = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders/${orderId}/capture`, {
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

  const response = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders/${orderId}`, {
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

  const body: any = {};
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
    `${PAYPAL_API_BASE}/v2/payments/captures/${captureId}/refund`,
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
