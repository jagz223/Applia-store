import type { Express } from "express";
import type { Server } from "http";
import {
  createPayPalOrder,
  capturePayPalOrder,
  getPayPalOrderDetails,
  refundPayPalPayment,
  isPayPalConfigured,
} from "./paypal";
import {
  retrieveStoreStripeCheckoutSession,
  isStripeCheckoutSessionPaid,
  constructWebhookEvent,
  isStripeConfigured,
} from "./stripe";
import {
  storePaymentsCancelUrl,
  storePaymentsSuccessUrl,
} from "./store-payment-checkout";
import { fulfillStorePendingCheckout, getStorePendingCheckout } from "./store-pending-checkout";
import { authenticateJWT } from "./routes-auth";

function redirectCancel(res: { redirect: (url: string) => void }, storeSlug?: string | null) {
  return res.redirect(storePaymentsCancelUrl(storeSlug ?? ""));
}

function redirectSuccess(res: { redirect: (url: string) => void }, orderId: number) {
  return res.redirect(storePaymentsSuccessUrl(orderId));
}

export async function registerPayPalRoutes(
  httpServer: Server,
  app: Express
): Promise<void> {
  app.get("/api/store-payments/stripe/return", async (req, res) => {
    const sessionId = String(req.query.session_id ?? "").trim();
    let storeSlug = "";
    if (!sessionId || !isStripeConfigured()) {
      return redirectCancel(res);
    }
    try {
      const session = await retrieveStoreStripeCheckoutSession(sessionId);
      const pendingId = String(session.metadata?.pendingCheckoutId ?? "").trim();
      if (pendingId) {
        const pending = await getStorePendingCheckout(pendingId);
        storeSlug = pending?.storeSlug ?? "";
      }
      if (!isStripeCheckoutSessionPaid(session) || !pendingId) {
        return redirectCancel(res, storeSlug);
      }
      const { order } = await fulfillStorePendingCheckout({
        pendingId,
        gatewayReference: `stripe:${session.id}`,
      });
      return redirectSuccess(res, order.id);
    } catch (error) {
      console.error("[store-payments] stripe return", error);
      return redirectCancel(res, storeSlug);
    }
  });

  app.post("/api/store-payments/stripe/webhook", async (req, res) => {
    const webhookSecret = (process.env.STRIPE_WEBHOOK_SECRET ?? "").trim();
    if (!webhookSecret || webhookSecret === "whsec_your_webhook_secret") {
      return res.status(503).json({ message: "Webhook de Stripe no configurado." });
    }
    const signature = String(req.headers["stripe-signature"] ?? "");
    const raw = req.rawBody;
    if (!signature || raw == null) {
      return res.status(400).json({ message: "Webhook inválido." });
    }
    try {
      const payload = Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw);
      const event = constructWebhookEvent(payload, signature);
      if (event.type === "checkout.session.completed") {
        const session = event.data.object as {
          id?: string;
          payment_status?: string;
          metadata?: { pendingCheckoutId?: string };
        };
        const pendingId = String(session.metadata?.pendingCheckoutId ?? "").trim();
        if (pendingId && (session.payment_status === "paid" || event.type === "checkout.session.completed")) {
          await fulfillStorePendingCheckout({
            pendingId,
            gatewayReference: `stripe:${session.id ?? ""}`,
          });
        }
      }
      return res.json({ received: true });
    } catch (error) {
      console.error("[store-payments] stripe webhook", error);
      return res.status(400).json({ message: "Webhook no verificado." });
    }
  });

  app.get("/api/store-payments/paypal/return", async (req, res) => {
    const token = String(req.query.token ?? "").trim();
    const pendingId = String(req.query.pendingId ?? "").trim();
    let storeSlug = "";
    if (pendingId) {
      const pending = await getStorePendingCheckout(pendingId);
      storeSlug = pending?.storeSlug ?? "";
      if (pending && pending.gatewayKind !== "paypal") {
        console.error("[store-payments] paypal return for non-paypal pending", pending.gatewayKind);
        return redirectCancel(res, storeSlug);
      }
    }
    if (!token || !pendingId || !isPayPalConfigured()) {
      return redirectCancel(res, storeSlug);
    }
    try {
      let captureStatus = "";
      let gatewayReference = `paypal:${token}`;
      try {
        const capture = await capturePayPalOrder(token);
        captureStatus = capture.status;
        gatewayReference = `paypal:${capture.transactionId || token}`;
      } catch {
        const details = await getPayPalOrderDetails(token);
        captureStatus = String(details?.status ?? "");
      }
      if (captureStatus !== "COMPLETED") {
        return redirectCancel(res, storeSlug);
      }
      const { order } = await fulfillStorePendingCheckout({
        pendingId,
        gatewayReference,
      });
      return redirectSuccess(res, order.id);
    } catch (error) {
      console.error("[store-payments] paypal capture", error);
      return redirectCancel(res, storeSlug);
    }
  });

  app.get("/api/store-payments/paypal/cancel", (req, res) => {
    const storeSlug = String(req.query.storeSlug ?? "").trim();
    return redirectCancel(res, storeSlug);
  });

  // POST /api/paypal/create-order - Crea una orden de PayPal
  app.post(
    "/api/paypal/create-order",
    authenticateJWT,
    async (req: any, res) => {
      try {
        const { amount, description, bookingId, currency } = req.body;

        if (!amount || !bookingId) {
          return res.status(400).json({ 
            message: "Monto y ID de reserva son requeridos" 
          });
        }

        const order = await createPayPalOrder(
          amount,
          currency || "USD",
          description || "Pago Applia",
          bookingId.toString()
        );

        res.json({
          orderId: order.orderId,
          approvalUrl: order.approvalUrl,
        });
      } catch (error: any) {
        console.error("Error creating PayPal order:", error);
        res.status(500).json({ message: error.message || "Error al crear orden PayPal" });
      }
    }
  );

  app.post(
    "/api/paypal/capture-order",
    authenticateJWT,
    async (req: any, res) => {
      try {
        const { orderId } = req.body;

        if (!orderId) {
          return res.status(400).json({ message: "Order ID es requerido" });
        }

        const capture = await capturePayPalOrder(orderId);

        res.json({
          status: capture.status,
          transactionId: capture.transactionId,
          payerEmail: capture.payerEmail,
          message: capture.status === "COMPLETED"
            ? "Pago completado exitosamente"
            : "Pago en proceso",
        });
      } catch (error: any) {
        console.error("Error capturing PayPal order:", error);
        res.status(500).json({ message: error.message || "Error al capturar pago" });
      }
    }
  );

  app.get(
    "/api/paypal/order/:orderId",
    authenticateJWT,
    async (req: any, res) => {
      try {
        const { orderId } = req.params;

        const details = await getPayPalOrderDetails(orderId);

        res.json(details);
      } catch (error: any) {
        console.error("Error getting PayPal order:", error);
        res.status(500).json({ message: error.message || "Error al obtener detalles" });
      }
    }
  );

  app.post(
    "/api/paypal/refund",
    authenticateJWT,
    async (req: any, res) => {
      try {
        const { captureId, amount, reason } = req.body;

        if (!captureId) {
          return res.status(400).json({ message: "Capture ID es requerido" });
        }

        const refund = await refundPayPalPayment(
          captureId,
          amount,
          reason
        );

        res.json({
          refundId: refund.refundId,
          status: refund.status,
          message: "Reembolso procesado",
        });
      } catch (error: any) {
        console.error("Error processing refund:", error);
        res.status(500).json({ message: error.message || "Error al procesar reembolso" });
      }
    }
  );

  app.get(
    "/api/paypal/status/:bookingId",
    authenticateJWT,
    async (req: any, res) => {
      try {
        const { bookingId } = req.params;

        res.json({
          bookingId,
          status: "pending",
          message: "Verifica el pago en tu historial de PayPal",
        });
      } catch (error: any) {
        console.error("Error getting payment status:", error);
        res.status(500).json({ message: error.message });
      }
    }
  );

  console.log("✅ PayPal routes registered");
}
