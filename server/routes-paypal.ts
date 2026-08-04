import type { Express } from "express";
import type { Server } from "http";
import {
  createPayPalOrder,
  capturePayPalOrder,
  getPayPalOrderDetails,
  refundPayPalPayment,
} from "./paypal";
import { authenticateJWT } from "./routes-auth";

export async function registerPayPalRoutes(
  httpServer: Server,
  app: Express
): Promise<void> {
  
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

  // POST /api/paypal/capture-order - Captura/confirma el pago
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

  // GET /api/paypal/order/:orderId - Obtiene detalles de la orden
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

  // POST /api/paypal/refund - Reembolsa un pago
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

  // GET /api/paypal/status/:bookingId - Verifica estado del pago
  app.get(
    "/api/paypal/status/:bookingId",
    authenticateJWT,
    async (req: any, res) => {
      try {
        const { bookingId } = req.params;
        
        // En una implementación real, almacenaríamos el orderId relacionado al booking
        // Por ahora, respondemos que no hay información
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
