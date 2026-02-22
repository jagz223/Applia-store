import Stripe from "stripe";

// Initialize Stripe with API key
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

export const stripe = stripeSecretKey 
  ? new Stripe(stripeSecretKey, {
      apiVersion: "2024-12-18.acacia",
    })
  : null;

// ============== TIPOS ==============

export interface CreatePaymentIntentParams {
  amount: number; // Amount in cents
  currency?: string;
  customerId?: string;
  metadata?: Record<string, string>;
}

export interface CreateCustomerParams {
  email: string;
  name: string;
  phone?: string;
}

export interface CreateEscrowPaymentParams {
  bookingId: number;
  clientId: string;
  providerId: string;
  amount: number;
  currency?: string;
  description?: string;
}

// ============== FUNCIONES ==============

// Crear cliente en Stripe
export async function createCustomer(params: CreateCustomerParams) {
  if (!stripe) {
    throw new Error("Stripe no está configurado");
  }

  return stripe.customers.create({
    email: params.email,
    name: params.name,
    phone: params.phone,
  });
}

// Crear PaymentIntent para pago
export async function createPaymentIntent(params: CreatePaymentIntentParams) {
  if (!stripe) {
    throw new Error("Stripe no está configurado");
  }

  return stripe.paymentIntents.create({
    amount: params.amount,
    currency: params.currency || "usd",
    customer: params.customerId,
    metadata: params.metadata,
  });
}

// Confirmar pago
export async function confirmPayment(paymentIntentId: string) {
  if (!stripe) {
    throw new Error("Stripe no está configurado");
  }

  return stripe.paymentIntents.retrieve(paymentIntentId);
}

// Liberar fondos (para escrow)
export async function transferToProvider(
  amount: number,
  destinationAccountId: string,
  description?: string
) {
  if (!stripe) {
    throw new Error("Stripe no está configurado");
  }

  return stripe.transfers.create({
    amount,
    currency: "usd",
    destination: destinationAccountId,
    description,
  });
}

// Crear cuenta Connect para profesionales
export async function createConnectedAccount(email: string) {
  if (!stripe) {
    throw new Error("Stripe no está configurado");
  }

  return stripe.accounts.create({
    type: "express",
    email,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
  });
}

// Obtener cuenta Connect
export async function getConnectedAccount(accountId: string) {
  if (!stripe) {
    throw new Error("Stripe no está configurado");
  }

  return stripe.accounts.retrieve(accountId);
}

// Crear link de onboarding para cuenta Connect
export async function createAccountLink(accountId: string, refreshUrl: string, returnUrl: string) {
  if (!stripe) {
    throw new Error("Stripe no está configurado");
  }

  return stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: "account_onboarding",
  });
}

// Webhook handler para verificar firma
export function constructWebhookEvent(payload: string, signature: string) {
  if (!stripe) {
    throw new Error("Stripe no está configurado");
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error("Stripe webhook secret no configurado");
  }

  return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
}

// Obtener balance de la cuenta
export async function getAccountBalance() {
  if (!stripe) {
    throw new Error("Stripe no está configurado");
  }

  return stripe.balance.retrieve();
}

// Listar pagos
export async function listPaymentIntents(limit?: number) {
  if (!stripe) {
    throw new Error("Stripe no está configurado");
  }

  return stripe.paymentIntents.list({
    limit: limit || 10,
  });
}

// Reembolsar pago
export async function refundPayment(paymentIntentId: string, amount?: number) {
  if (!stripe) {
    throw new Error("Stripe no está configurado");
  }

  return stripe.refunds.create({
    payment_intent: paymentIntentId,
    amount,
  });
}

// Verificar si Stripe está configurado
export function isStripeConfigured(): boolean {
  return !!stripe;
}
