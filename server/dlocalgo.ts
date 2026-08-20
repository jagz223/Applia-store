function dlocalGoApiKey(): string {
  return (process.env.DLOCALGO_API_KEY ?? "").trim();
}

function dlocalGoSecretKey(): string {
  return (process.env.DLOCALGO_SECRET_KEY ?? "").trim();
}

function dlocalGoMode(): string {
  return (process.env.DLOCALGO_MODE || "sandbox").trim().toLowerCase();
}

function dlocalGoCurrency(): string {
  const raw = (process.env.DLOCALGO_CURRENCY ?? "USD").trim().toUpperCase();
  return raw || "USD";
}

function dlocalGoCountry(): string | undefined {
  const raw = (process.env.DLOCALGO_COUNTRY ?? "").trim().toUpperCase();
  return raw || undefined;
}

function dlocalGoBaseUrl(): string {
  return dlocalGoMode() === "live" || dlocalGoMode() === "production"
    ? "https://api.dlocalgo.com"
    : "https://api-sbx.dlocalgo.com";
}

export function isDlocalGoConfigured(): boolean {
  return Boolean(dlocalGoApiKey() && dlocalGoSecretKey());
}

export async function createStoreDlocalGoPayment(params: {
  amount: number;
  orderId: number;
  storeId: number;
  storeName: string;
  successUrl: string;
  backUrl: string;
  payer?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  };
}): Promise<{ checkoutUrl: string; paymentId: string }> {
  if (!isDlocalGoConfigured()) {
    throw new Error("DLOCALGO_NOT_CONFIGURED");
  }

  const amount = Number(params.amount.toFixed(2));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("DLOCALGO_AMOUNT_INVALID");
  }

  const payer: Record<string, string> = {};
  const name = params.payer?.name?.trim();
  const email = params.payer?.email?.trim();
  const phone = params.payer?.phone?.trim();
  if (name) payer.name = name.slice(0, 100);
  if (email) payer.email = email.slice(0, 100);
  if (phone) payer.phone = phone.slice(0, 100);

  const body: Record<string, unknown> = {
    currency: dlocalGoCurrency(),
    amount,
    order_id: `store-${params.storeId}-order-${params.orderId}`.slice(0, 128),
    description: `Pedido #${params.orderId} · ${params.storeName}`.slice(0, 100),
    success_url: params.successUrl,
    back_url: params.backUrl,
  };
  const country = dlocalGoCountry();
  if (country) body.country = country;
  if (Object.keys(payer).length > 0) body.payer = payer;

  const response = await fetch(`${dlocalGoBaseUrl()}/v1/payments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${dlocalGoApiKey()}:${dlocalGoSecretKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`dLocal Go payment failed: ${error}`);
  }

  const data = (await response.json()) as {
    id?: string;
    redirect_url?: string;
  };

  if (!data.redirect_url || !data.id) {
    throw new Error("DLOCALGO_CHECKOUT_URL_MISSING");
  }

  return { checkoutUrl: data.redirect_url, paymentId: data.id };
}
