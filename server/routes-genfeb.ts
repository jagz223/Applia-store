import type { Express } from "express";
import type { Server } from "http";
import { storage as genFebStorage } from "./storage-genfeb";
import { authenticateJWT } from "./routes-auth";
import { z } from "zod";
import { notificationService } from "./services/notification.service";
import { getIO, sendNotificationToAdmins, sendNotificationToUser } from "./socket";
import { calcCommission, calcProviderNet } from "@shared/platform-commission";

// Usar storage de GenFeb para las nuevas funcionalidades
const storage = genFebStorage;

/** Mensajes por página en el chat (paginación). Balance entre UX y carga en servidor. */
export const CHAT_MESSAGES_PAGE_SIZE = 25;

// ============== ESQUEMAS DE VALIDACIÓN ==============

/** Cuerpo para crear reserva: userId se toma del JWT, providerId se deriva del servicio en el storage. */
const createBookingBodySchema = z.object({
  serviceId: z.number({ required_error: "serviceId es requerido" }),
  date: z.string().min(1, "date es requerido"),
  notes: z.string().optional(),
});

const updateBookingStatusSchema = z.object({
  status: z.enum(["pending", "confirmed", "in_progress", "completed", "cancelled"]),
});

// Payment schemas
const createPaymentSchema = z.object({
  bookingId: z.number(),
  amount: z.number().positive(),
  currency: z.string().default("USD"),
  paymentMethod: z.enum(["stripe", "paypal", "bank_transfer"]),
});

const releaseEscrowSchema = z.object({
  paymentId: z.number(),
  release: z.boolean(),
  reason: z.string().optional(),
});

// Document schemas
const uploadDocumentSchema = z.object({
  name: z.string(),
  type: z.enum(["contract", "invoice", "identity", "legal", "insurance", "other"]),
  size: z.number().positive(),
  mimeType: z.string(),
});

// Message schemas
const sendMessageSchema = z.object({
  conversationId: z.number(),
  content: z.string().min(1),
  type: z.enum(["text", "image", "file", "location"]).default("text"), // location = compartir ubicación en el chat
});

// User role schemas
const updateUserRoleSchema = z.object({
  role: z.enum(["admin", "professional", "client"]),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  bio: z.string().optional(),
});

// ============== RUTAS DE GENFEB S.A.S. ==============

export async function registerGenFebRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // ---------- RESERVAS (BOOKINGS) ----------
  
  // GET /api/bookings - Listar reservas del usuario (cliente)
  app.get("/api/bookings", authenticateJWT, async (req: any, res) => {
    try {
      const rawId = req.user?.id;
      const userId = rawId != null ? String(rawId) : undefined;
      const status = req.query.status as string | undefined;

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const bookings = await storage.getBookingsByUser(userId, status);
      const list = Array.isArray(bookings) ? bookings : [];
      res.json(list);
    } catch (error: any) {
      console.error("Error fetching bookings:", error?.stack ?? error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/bookings/provider - Listar reservas del profesional (como proveedor)
  app.get("/api/bookings/provider", authenticateJWT, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const provider = await storage.getProviderByUserId(userId);
      if (!provider) {
        return res.json([]);
      }
      const status = req.query.status as string | undefined;
      const bookings = await storage.getBookingsByProvider(provider.id);
      const filtered = status ? bookings.filter((b: { status: string }) => b.status === status) : bookings;
      res.json(filtered);
    } catch (error) {
      console.error("Error fetching provider bookings:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // POST /api/bookings - Crear nueva reserva (userId desde JWT; providerId se deriva del servicio en el storage)
  app.post("/api/bookings", authenticateJWT, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const data = createBookingBodySchema.parse(req.body);
      const date = new Date(data.date);
      if (Number.isNaN(date.getTime())) {
        return res.status(400).json({ message: "Fecha inválida" });
      }

      const service = await storage.getService(data.serviceId);
      if (!service) {
        return res.status(404).json({ message: "Servicio no encontrado" });
      }

      const providerId = (service as { providerId?: number; provider?: { id: number } }).provider?.id
        ?? (service as { providerId?: number }).providerId;
      if (providerId == null) {
        return res.status(400).json({ message: "El servicio no tiene proveedor asociado" });
      }

      const booking = await storage.createBooking({
        userId,
        serviceId: data.serviceId,
        date,
        notes: data.notes ?? undefined,
        status: "pending",
        providerId: Number(providerId),
      });
      const provider = await storage.getProvider(Number(providerId));
      const providerUserId = provider ? (provider as { userId?: string }).userId : undefined;
      if (providerUserId) {
        await storage.createNotification({
          userId: providerUserId,
          type: "booking",
          data: { type: "new_booking", booking: { id: (booking as { id: number }).id, serviceId: data.serviceId, date, status: "pending", userId } },
        });
        const io = getIO();
        if (io) {
          io.to(`user:${providerUserId}`).emit("notification:booking", {
            type: "new_booking",
            booking: { id: (booking as { id: number }).id, serviceId: data.serviceId, date, status: "pending", userId },
            timestamp: new Date(),
          });
        }
        // Push FCM para cuando el profesional no tiene la app abierta
        void notificationService
          .sendPushToUser(providerUserId, {
            title: "Nueva solicitud de reserva",
            body: "Tienes una nueva solicitud de reserva. Revisa el detalle en tu Panel Asociado.",
            data: {
              url: `/professional-dashboard?tab=bookings&highlight=${(booking as { id: number }).id}`,
              type: "booking",
              bookingId: String((booking as { id: number }).id),
            },
          })
          .catch((err) => console.error("[push] Error notificando nueva reserva:", err));
      }
      res.status(201).json(booking);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error creating booking:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // GET /api/bookings/:id - Obtener reserva por ID (incluye serviceTitle para contexto de chat)
  app.get("/api/bookings/:id", async (req, res) => {
    try {
      const booking = await storage.getBooking(Number(req.params.id));
      if (!booking) return res.status(404).json({ message: "Booking not found" });
      const b = booking as { serviceId?: number };
      let serviceTitle: string | undefined;
      if (b.serviceId != null) {
        const service = await storage.getService(b.serviceId);
        serviceTitle = service?.title;
      }
      res.json({ ...booking, serviceTitle });
    } catch (error) {
      console.error("Error fetching booking:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // PATCH /api/bookings/:id/status - Actualizar estado de reserva (cliente solo puede cancelar; profesional con restricciones)
  app.patch("/api/bookings/:id/status", authenticateJWT, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const data = updateBookingStatusSchema.parse(req.body);
      const bookingId = Number(req.params.id);
      const currentBooking = await storage.getBooking(bookingId);
      if (!currentBooking) return res.status(404).json({ message: "Booking not found" });

      const bid = currentBooking as { userId?: string; providerId?: number; confirmedByClient?: boolean; cost?: number };
      const isClient = bid.userId === userId;
      const provider = await storage.getProviderByUserId(userId);
      const isProvider = provider != null && (provider as { id?: number }).id === bid.providerId;

      // Solo el cliente o el profesional de la reserva pueden cambiar el estado
      if (!isClient && !isProvider) {
        return res.status(403).json({ message: "No tienes permiso para cambiar el estado de esta reserva" });
      }

      // Cliente solo puede cancelar (pasar a 'cancelled')
      if (isClient) {
        if (data.status !== "cancelled") {
          return res.status(403).json({ message: "Solo puedes cancelar la reserva. Para confirmar el pago usa el botón Confirmar pago." });
        }
      } else {
        // Es el profesional
        // FSM Guard: 'in_progress' inalcanzable si confirmedByClient es false
        if (data.status === "in_progress") {
          if (bid.confirmedByClient !== true) {
            return res.status(403).json({
              message: "Debes esperar a que el cliente confirme el pago antes de marcar como En proceso.",
            });
          }
        }
        // FSM Guard: completed es inalcanzable si confirmedByClient es false
        if (data.status === "completed") {
          if (bid.confirmedByClient !== true) {
            return res.status(403).json({
              message: "El servicio requiere confirmación previa del cliente para procesar los fondos retenidos",
            });
          }
        }
        // No permitir confirmar la reserva si el profesional no ha asignado un costo
        if (data.status === "confirmed") {
          const cost = bid.cost;
          const costNum = typeof cost === "number" ? cost : Number(cost);
          if (!Number.isFinite(costNum) || costNum <= 0) {
            return res.status(400).json({
              message: "Debes asignar un costo a la reserva antes de confirmarla. Edita el monto en Solicitudes pendientes y guárdalo.",
            });
          }
        }
      }

      let booking: any;
      if (data.status === "completed" && isProvider) {
        try {
          booking = await storage.completeBookingAndReleaseEscrow(bookingId);
        } catch (err: any) {
          const msg = err?.message || "Error al completar la reserva";
          if (msg.includes("confirmación previa") || msg.includes("Costo") || msg.includes("Fondos en espera")) {
            return res.status(400).json({ message: msg });
          }
          throw err;
        }
        if (!booking) return res.status(404).json({ message: "Booking not found" });
      } else if (data.status === "cancelled" && isProvider) {
        // Si el profesional cancela y el cliente ya había confirmado el pago,
        // se debe devolver el dinero desde pendingBalance a la wallet del cliente.
        try {
          booking = await storage.cancelBookingAndRefundClientEscrow(bookingId);
        } catch (err: any) {
          const msg = err?.message || "Error al cancelar la reserva";
          if (msg.includes("Fondos retenidos insuficientes") || msg.includes("Costo de reserva no definido")) {
            return res.status(400).json({ message: msg });
          }
          throw err;
        }
        if (!booking) return res.status(404).json({ message: "Booking not found" });
      } else {
        booking = await storage.updateBookingStatus(bookingId, data.status);
        if (!booking) return res.status(404).json({ message: "Booking not found" });
      }

      // Notificación al profesional cuando el cliente cancela la reserva (persistida + tiempo real + push)
      if (data.status === "cancelled" && isClient) {
        const providerId = (currentBooking as { providerId?: number }).providerId;
        const provider = providerId != null ? await storage.getProvider(providerId) : undefined;
        const providerUserId = provider != null ? String((provider as { userId?: string }).userId ?? "") : "";
        if (providerUserId) {
          const notifData = { bookingId, message: "El cliente canceló la reserva." };
          try {
            await storage.createNotification({
              userId: providerUserId,
              type: "booking_cancelled",
              data: notifData,
            });
          } catch (err) {
            console.error("[booking-cancelled] Error persistiendo notificación para el profesional:", err);
          }
          const io = getIO();
          if (io) {
            sendNotificationToUser(io, providerUserId, { type: "booking_cancelled", data: notifData });
          }
          void notificationService.sendPushToUser(providerUserId, {
            title: "Reserva cancelada",
            body: "El cliente canceló la reserva.",
            data: { url: "/professional-dashboard?tab=bookings", type: "booking_cancelled", bookingId: String(bookingId) },
          });
        }
      }

      // Notificación al cliente cuando el profesional cancela la reserva (persistida + tiempo real + push)
      if (data.status === "cancelled" && isProvider) {
        const clientUserId = (bid.userId as string | undefined) ?? (currentBooking as { userId?: string }).userId;
        if (clientUserId) {
          const refundHappened = bid.confirmedByClient === true;
          const rawCost = typeof booking?.cost === "number" ? booking.cost : bid.cost;
          const costNum = typeof rawCost === "number" ? rawCost : Number(rawCost);
          const amountFormatted =
            refundHappened && Number.isFinite(costNum) && costNum > 0
              ? new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(costNum)
              : "";

          const message = refundHappened
            ? amountFormatted
              ? `El asociado canceló el servicio. Se te devolvieron ${amountFormatted} a tu billetera.`
              : "El asociado canceló el servicio. Se te devolvió el monto retenido a tu billetera."
            : "El asociado canceló el servicio. No se realizó ningún cobro.";

          const notifData = { bookingId, message };
          try {
            await storage.createNotification({
              userId: clientUserId,
              type: "booking_cancelled_by_provider",
              data: notifData,
            });
          } catch (err) {
            console.error("[booking_cancelled_by_provider] Error persistiendo notificación para el cliente:", err);
          }

          const io = getIO();
          if (io) {
            sendNotificationToUser(io, clientUserId, { type: "booking_cancelled_by_provider", data: notifData });
          }

          void notificationService.sendPushToUser(clientUserId, {
            title: "Servicio cancelado",
            body: message,
            data: { url: `/bookings?highlight=${bookingId}`, type: "booking_cancelled_by_provider", bookingId: String(bookingId), message },
          });
        }
      }

      // Notificación al cliente cuando el profesional confirma la reserva (persistida para que sobreviva al refresh)
      if (data.status === "confirmed") {
        const clientUserId = (currentBooking ?? booking) as { userId?: string };
        const uid = clientUserId.userId;
        if (uid) {
          await storage.createNotification({
            userId: uid,
            type: "booking_confirmed_by_provider",
            data: { bookingId, message: "Confirma el pago para retener los fondos." },
          });
          const io = getIO();
          if (io) {
            sendNotificationToUser(io, uid, {
              type: "booking_confirmed_by_provider",
              data: { bookingId, message: "Confirma el pago para retener los fondos." },
            });
          }
          void notificationService.sendPushToUser(uid, {
            title: "Reserva confirmada por el asociado",
            body: "Confirma el pago para retener los fondos.",
            data: { url: "/bookings", type: "booking_confirmed_by_provider", bookingId: String(bookingId) },
          });
        }
      }

      res.json(booking);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error updating booking:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ---------- CALIFICACIONES (RATINGS) ----------
  const submitRatingSchema = z.object({
    bookingId: z.number(),
    ratedUserId: z.string().min(1),
    roleRated: z.enum(["professional", "client"]),
    stars: z.number().min(1).max(5),
  });

  app.get("/api/ratings/pending", authenticateJWT, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const pending = await storage.getPendingBookingRatings(userId);
      return res.json({ pending });
    } catch (error) {
      console.error("Error fetching pending ratings:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/ratings", authenticateJWT, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const body = submitRatingSchema.parse(req.body);
      await storage.submitBookingRating(
        userId,
        body.bookingId,
        body.ratedUserId,
        body.roleRated,
        body.stars
      );
      return res.json({ ok: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Datos inválidos", errors: error.errors });
      }
      console.error("Error submitting rating:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // POST /api/bookings/:id/confirm-client - Cliente confirma pago (handshake/escrow); transacción ACID
  app.post("/api/bookings/:id/confirm-client", authenticateJWT, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const bookingId = Number(req.params.id);
      if (!Number.isFinite(bookingId)) return res.status(400).json({ message: "ID de reserva inválido" });

      const existing = await storage.getBooking(bookingId);
      if (!existing) return res.status(404).json({ message: "Reserva no encontrada" });
      const bid = existing as { userId?: string; providerId?: number };
      if (bid.userId !== userId) return res.status(403).json({ message: "Solo el cliente de la reserva puede confirmar el pago" });

      const updated = await storage.confirmBookingByClient(bookingId);
      const cost = typeof (updated as { cost?: number }).cost === "number" ? (updated as { cost: number }).cost : Number((updated as { cost?: unknown }).cost) || 0;
      const amountFormatted = cost > 0 ? cost.toFixed(2) : "";
      const commission = calcCommission(cost);
      const providerNet = calcProviderNet(cost);
      const commissionFormatted = commission > 0 ? commission.toFixed(2) : "";
      const providerNetFormatted = providerNet > 0 ? providerNet.toFixed(2) : "";

      // Notificación al profesional: fondos agregados (retenidos a su favor) + cliente confirmó el pago
      const provider = bid.providerId != null ? await storage.getProvider(bid.providerId) : undefined;
      const providerUserId = provider != null ? String((provider as { userId?: string }).userId ?? "") : "";
      if (providerUserId) {
        const notifData = {
          bookingId,
          amount: cost,
          amountFormatted,
          commission,
          commissionFormatted,
          providerNet,
          providerNetFormatted,
          message: amountFormatted
            ? `Se te han retenido $${amountFormatted} USD (retenidos). El cliente confirmó el pago. Recibirás $${providerNetFormatted} USD (90%) y la plataforma tomará $${commissionFormatted} USD (10%). Ya puedes completar el servicio.`
            : "El cliente confirmó el pago. Ya puedes iniciar o completar el trabajo.",
        };
        try {
          await storage.createNotification({
            userId: providerUserId,
            type: "booking_confirmed_by_client",
            data: notifData,
          });
        } catch (err) {
          console.error("[confirm-client] Error persistiendo notificación para el profesional:", err);
        }
        const io = getIO();
        if (io) {
          sendNotificationToUser(io, providerUserId, {
            type: "booking_confirmed_by_client",
            data: notifData,
          });
        }
        void notificationService.sendPushToUser(providerUserId, {
          title: "Fondos agregados",
          body: amountFormatted && providerNetFormatted && commissionFormatted
            ? `Se te han retenido $${amountFormatted} USD. Recibirás $${providerNetFormatted} USD (90%) y la plataforma tomará $${commissionFormatted} USD (10%). Completa el servicio para liberar los fondos.`
            : amountFormatted
              ? `Se te han retenido $${amountFormatted} USD. Completa el servicio para liberar los fondos.`
              : "El cliente confirmó el pago.",
          data: { url: "/professional-dashboard?tab=bookings", type: "booking_confirmed_by_client", bookingId: String(bookingId) },
        });
      }

      res.json(updated);
    } catch (error: any) {
      const msg = error?.message || "Error al confirmar el pago";
      if (msg.includes("Saldo insuficiente")) return res.status(400).json({ message: msg });
      if (msg.includes("ya fue confirmada") || msg.includes("confirmar el pago cuando")) return res.status(400).json({ message: msg });
      if (msg.includes("no encontrada")) return res.status(400).json({ message: msg });
      if (msg.includes("no está definido")) {
        return res.status(400).json({
          message: "El profesional aún no ha definido el costo de esta reserva. Por favor espera a que asigne el monto desde su panel.",
        });
      }
      console.error("Error confirm-client:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // PATCH /api/bookings/:id/cost - Actualizar costo de la reserva (solo profesional, solo si estado es 'pending')
  const updateBookingCostSchema = z.object({ cost: z.number().min(0, "El costo debe ser mayor o igual a 0") });
  app.patch("/api/bookings/:id/cost", authenticateJWT, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const bookingId = Number(req.params.id);
      if (!Number.isFinite(bookingId)) return res.status(400).json({ message: "ID de reserva inválido" });
      const body = updateBookingCostSchema.parse(req.body);
      const booking = await storage.getBooking(bookingId);
      if (!booking) return res.status(404).json({ message: "Reserva no encontrada" });
      const provider = await storage.getProviderByUserId(userId);
      if (!provider) return res.status(403).json({ message: "No eres proveedor de esta reserva" });
      const bid = booking as { providerId?: number; status?: string };
      if (bid.providerId !== provider.id) return res.status(403).json({ message: "No puedes editar esta reserva" });
      if ((bid.status || "pending") !== "pending") {
        return res.status(403).json({ message: "Solo puedes editar el costo cuando la reserva está pendiente" });
      }
      const updated = await storage.updateBookingCost(bookingId, body.cost);
      if (!updated) return res.status(500).json({ message: "Error al actualizar el costo" });
      const clientUserId = (booking as { userId?: string }).userId;
      const amountFormatted = typeof body.cost === "number" ? body.cost.toFixed(2) : String(body.cost);
      if (clientUserId) {
        const notifData = { bookingId, amount: body.cost, amountFormatted };
        try {
          await storage.createNotification({
            userId: clientUserId,
            type: "booking_cost_changed",
            data: notifData,
          });
          const io = getIO();
          if (io) sendNotificationToUser(io, clientUserId, { type: "booking_cost_changed", data: notifData });
          void notificationService.sendPushToUser(clientUserId, {
            title: "Se actualizó el monto del servicio",
            body: `Nuevo monto: $${amountFormatted} USD. Revisa tu reserva.`,
            data: { url: `/bookings?highlight=${bookingId}`, type: "booking_cost_changed", bookingId: String(bookingId) },
          }).catch((err: Error) => console.error("[push] Error notificando cambio de monto:", err));
        } catch (e) {
          console.error("Error creando notificación de cambio de monto:", e);
        }
      }

      // Recordatorio para el profesional: comisión y neto al acordar este monto
      const commission = calcCommission(body.cost);
      const providerNet = calcProviderNet(body.cost);
      const commissionFormatted = commission.toFixed(2);
      const providerNetFormatted = providerNet.toFixed(2);
      const proNotifData = {
        bookingId,
        amount: body.cost,
        amountFormatted,
        commission,
        commissionFormatted,
        providerNet,
        providerNetFormatted,
      };
      try {
        await storage.createNotification({
          userId,
          type: "booking_cost_commission_reminder",
          data: proNotifData,
        });
        const io = getIO();
        if (io) sendNotificationToUser(io, userId, { type: "booking_cost_commission_reminder", data: proNotifData });
        void notificationService.sendPushToUser(userId, {
          title: "Recordatorio de comisión",
          body: `Al acordar $${amountFormatted} USD, recibirás $${providerNetFormatted} USD (90%). Comisión de plataforma: $${commissionFormatted} USD (10%).`,
          data: { url: `/professional-dashboard?tab=bookings&highlight=${bookingId}`, type: "booking_cost_commission_reminder", bookingId: String(bookingId) },
        }).catch((err: Error) => console.error("[push] Error notificando recordatorio de comisión:", err));
      } catch (e) {
        console.error("Error creando recordatorio de comisión:", e);
      }
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error updating booking cost:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // PATCH /api/bookings/:id/schedule - Actualizar fecha/hora de la reserva (solo profesional, solo si estado es 'pending')
  const updateBookingScheduleSchema = z.object({ date: z.string().min(1, "La fecha es requerida") });
  app.patch("/api/bookings/:id/schedule", authenticateJWT, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const bookingId = Number(req.params.id);
      if (!Number.isFinite(bookingId)) return res.status(400).json({ message: "ID de reserva inválido" });
      const body = updateBookingScheduleSchema.parse(req.body);
      const date = new Date(body.date);
      if (Number.isNaN(date.getTime())) return res.status(400).json({ message: "Fecha u hora inválida" });
      const booking = await storage.getBooking(bookingId);
      if (!booking) return res.status(404).json({ message: "Reserva no encontrada" });
      const provider = await storage.getProviderByUserId(userId);
      if (!provider) return res.status(403).json({ message: "No eres proveedor de esta reserva" });
      const bid = booking as { providerId?: number; status?: string };
      if (bid.providerId !== (provider as { id: number }).id) return res.status(403).json({ message: "No puedes editar esta reserva" });
      if ((bid.status || "pending") !== "pending") {
        return res.status(403).json({ message: "Solo puedes cambiar la fecha cuando la reserva está pendiente" });
      }
      const updated = await storage.updateBookingSchedule(bookingId, date);
      if (!updated) return res.status(500).json({ message: "Error al actualizar la fecha" });
      const clientUserId = (booking as { userId?: string }).userId;
      const dateFormatted = date.toLocaleString("es-EC", { dateStyle: "long", timeStyle: "short" });
      if (clientUserId) {
        const notifData = { bookingId, dateFormatted, dateIso: date.toISOString() };
        try {
          await storage.createNotification({
            userId: clientUserId,
            type: "booking_schedule_changed",
            data: notifData,
          });
          const io = getIO();
          if (io) sendNotificationToUser(io, clientUserId, { type: "booking_schedule_changed", data: notifData });
          void notificationService.sendPushToUser(clientUserId, {
            title: "Se cambió la fecha del servicio",
            body: `Nueva fecha y hora: ${dateFormatted}.`,
            data: { url: `/bookings?highlight=${bookingId}`, type: "booking_schedule_changed", bookingId: String(bookingId) },
          }).catch((err: Error) => console.error("[push] Error notificando cambio de fecha:", err));
        } catch (e) {
          console.error("Error creando notificación de cambio de fecha:", e);
        }
      }
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Datos inválidos", errors: error.errors });
      }
      console.error("Error updating booking schedule:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // ---------- PAGOS ESCROW ----------
  
  // GET /api/payments - Listar pagos del usuario
  app.get("/api/payments", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const payments = await storage.getPaymentsByUser(userId);
      res.json(payments);
    } catch (error) {
      console.error("Error fetching payments:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // GET /api/payments/escrow - Listar pagos en escrow
  app.get("/api/payments/escrow", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const escrowPayments = await storage.getEscrowPayments(userId);
      res.json(escrowPayments);
    } catch (error) {
      console.error("Error fetching escrow payments:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // POST /api/payments/escrow - Crear pago en escrow
  app.post("/api/payments/escrow", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const data = createPaymentSchema.parse(req.body);
      
      // Crear pago en escrow
      const payment = await storage.createEscrowPayment({
        ...data,
        clientId: userId,
        status: "pending",
      });
      
      res.status(201).json(payment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error creating escrow payment:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // POST /api/payments/escrow/release - Liberar fondos de escrow
  app.post("/api/payments/escrow/release", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const data = releaseEscrowSchema.parse(req.body);
      const payment = await storage.releaseEscrowPayment(data.paymentId, data.release, data.reason);
      
      res.json(payment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error releasing escrow:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // GET /api/payments/balance - Obtener saldo
  app.get("/api/payments/balance", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const balance = await storage.getUserBalance(userId);
      res.json(balance);
    } catch (error) {
      console.error("Error fetching balance:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ---------- WALLET ----------

  // GET /api/wallet/platform-balance - Balance total de la plataforma (solo admin)
  app.get("/api/wallet/platform-balance", authenticateJWT, async (req: any, res) => {
    try {
      if (req.user?.role !== "admin") {
        return res.status(403).json({ message: "Se requiere rol de administrador" });
      }
      const total = await storage.getTotalPlatformBalance();
      res.json({ totalBalance: total });
    } catch (error) {
      console.error("Error fetching platform balance:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/users/me/wallet - Wallet y ganancias totales del usuario autenticado
  app.get("/api/users/me/wallet", authenticateJWT, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const user = await storage.getUserById(userId);
      if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
      const u = user as { wallet?: number; totalEarnings?: number; rating?: number; ratingCount?: number };
      res.json({
        wallet: typeof u.wallet === "number" ? u.wallet : 0,
        totalEarnings: typeof u.totalEarnings === "number" ? u.totalEarnings : 0,
        rating: typeof u.rating === "number" ? u.rating : 5,
        ratingCount: typeof u.ratingCount === "number" ? u.ratingCount : 0,
      });
    } catch (error) {
      console.error("Error fetching user wallet:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/wallet/me - Wallet del usuario autenticado.
  // pendingBalance = escrow de reservas (solo cliente: dinero retenido al confirmar una reserva).
  // withdrawingFunds = fondos en tránsito por retiro (independiente; no es pendingBalance).
  app.get("/api/wallet/me", authenticateJWT, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const user = await storage.getUserById(userId);
      if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
      const u = user as { wallet?: number; totalEarnings?: number; pendingBalance?: number; withdrawingFunds?: number; rating?: number; ratingCount?: number };
      res.json({
        wallet: typeof u.wallet === "number" ? u.wallet : 0,
        totalEarnings: typeof u.totalEarnings === "number" ? u.totalEarnings : 0,
        pendingBalance: typeof u.pendingBalance === "number" ? u.pendingBalance : 0,
        withdrawingFunds: typeof u.withdrawingFunds === "number" ? u.withdrawingFunds : 0,
        rating: typeof u.rating === "number" ? u.rating : 5,
        ratingCount: typeof u.ratingCount === "number" ? u.ratingCount : 0,
      });
    } catch (error) {
      console.error("Error fetching user wallet:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Feature flag: futura API bancaria para automatizar retiros (por ahora siempre manual vía Admin → Payouts).
  const ENABLE_BANK_API = process.env.ENABLE_BANK_API === "true";

  // POST /api/wallet/withdraw - Solicitar retiro (escrow: wallet -> withdrawingFunds).
  // Atomicidad: storage.requestWithdraw (y processWithdrawal en admin) realizan actualizaciones atómicas
  // (transacción en Firestore; en memoria es secuencial) para evitar discrepancias de balance.
  // Validación: requiere bankName y accountNumber en el perfil. Si ENABLE_BANK_API=true en el futuro,
  // aquí se conectaría la llamada a la API bancaria en lugar del flujo manual.
  app.post("/api/wallet/withdraw", authenticateJWT, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const user = await storage.getUserById(userId);
      if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
      const u = user as { bankName?: string; accountNumber?: string };
      const bankName = typeof u.bankName === "string" ? u.bankName.trim() : "";
      const accountNumber = typeof u.accountNumber === "string" ? u.accountNumber.trim() : "";
      if (!bankName || !accountNumber) {
        return res.status(400).json({
          message: "Para retirar fondos debes completar los datos bancarios (banco y número de cuenta) en tu perfil.",
          code: "missing_bank_data",
        });
      }
      const schema = z.object({ amount: z.number().positive("El monto debe ser mayor a cero") });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.errors?.[0]?.message ?? "Datos inválidos",
          code: "validation",
        });
      }
      // Modo manual (default): requestWithdraw mueve saldo a withdrawingFunds; el admin procesa en Panel → Payouts.
      // if (ENABLE_BANK_API) { ... llamada futura a API bancaria ... }
      const result = await storage.requestWithdraw(userId, parsed.data.amount);
      if (!result.ok) {
        const status = ["insufficient_balance", "withdraw_pending", "missing_bank_data"].includes(result.code) ? 400 : 400;
        return res.status(status).json({ message: result.message, code: result.code });
      }
      const amountFormatted = new Intl.NumberFormat("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(parsed.data.amount);
      const userName = (user as { name?: string; firstName?: string; lastName?: string }).name
        ?? ([((user as { firstName?: string }).firstName ?? ""), ((user as { lastName?: string }).lastName ?? "")].filter(Boolean).join(" ") || (user as { email?: string }).email || "Usuario");

      // Notificación persistente para cada admin (aparece en la campana al cargar o al conectarse)
      const { users: adminUsers } = await storage.getUsers({ role: "admin", page: 1, limit: 100, name: "", email: "", lastName: "" });
      for (const admin of adminUsers ?? []) {
        const adminId = (admin as { id?: string }).id;
        if (adminId) {
          await storage.createNotification({
            userId: adminId,
            type: "admin",
            data: {
              type: "withdrawal_requested",
              message: "Un profesional solicitó retirar fondos. Revisa la pestaña Solicitudes de Retiro en el Panel de Administración.",
              userId,
              userName,
              amount: parsed.data.amount,
              amountFormatted,
            },
          });
        }
      }

      const io = getIO();
      if (io) {
        sendNotificationToAdmins(io, {
          type: "withdrawal_requested",
          message: "Un profesional solicitó retirar fondos. Revisa la pestaña Solicitudes de Retiro en el Panel de Administración.",
          data: { userId, userName, amount: parsed.data.amount, amountFormatted },
        });
      }

      // Push FCM para cada admin (si no tienen la app abierta)
      void Promise.all(
        (adminUsers ?? []).map((admin: { id?: string }) => {
          const adminId = admin?.id;
          if (!adminId) return;
          return notificationService.sendPushToUser(adminId, {
            title: "Nueva solicitud de retiro",
            body: `${userName} solicitó retirar $${amountFormatted} USD. Revisa Solicitudes de Retiro en el Panel de Administración.`,
            data: {
              url: "/admin?tab=payouts",
              type: "admin",
              withdrawalType: "withdrawal_requested",
              userId,
              userName,
              amountFormatted,
            },
          });
        })
      ).catch((err) => console.error("[push] Error notificando admins por retiro:", err));
      return res.status(200).json({ message: "Retiro solicitado. Aparecerás en Panel de Administración → Solicitudes de Retiro para que el administrador procese la transferencia.", ok: true });
    } catch (error) {
      console.error("Error requesting withdraw:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/wallet/transfers - Listar transferencias del usuario (paginado y filtros)
  app.get("/api/wallet/transfers", authenticateJWT, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const page = Math.max(1, parseInt(String(req.query.page || 1), 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || 10), 10) || 10));
      const transferType = req.query.transferType as "service_payment" | "recharge" | undefined;
      const status = req.query.status as "pending_approval" | "completed" | "rejected" | undefined;
      const description = req.query.description as string | undefined;
      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo = req.query.dateTo as string | undefined;
      const amountMin = req.query.amountMin != null ? Number(req.query.amountMin) : undefined;
      const amountMax = req.query.amountMax != null ? Number(req.query.amountMax) : undefined;
      const result = await storage.getTransfersByUser(userId, {
        page,
        limit,
        transferType,
        status,
        description: description?.trim() || undefined,
        dateFrom: dateFrom?.trim() || undefined,
        dateTo: dateTo?.trim() || undefined,
        amountMin: Number.isFinite(amountMin) ? amountMin : undefined,
        amountMax: Number.isFinite(amountMax) ? amountMax : undefined,
      });
      const transfers = (result.transfers || []).map((t: { createdAt?: unknown; [k: string]: unknown }) => {
        const raw = t.createdAt;
        let iso: string | undefined;
        if (raw instanceof Date) iso = raw.toISOString();
        else if (raw && typeof raw === "object" && "toDate" in raw && typeof (raw as { toDate: () => Date }).toDate === "function") iso = (raw as { toDate: () => Date }).toDate().toISOString();
        else if (raw && typeof raw === "object" && "seconds" in raw) iso = new Date((raw as { seconds: number }).seconds * 1000).toISOString();
        else if (typeof raw === "string") iso = raw;
        return { ...t, createdAt: iso ?? raw };
      });
      res.json({ transfers, total: result.total });
    } catch (error) {
      console.error("Error fetching wallet transfers:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/professional/stats - Estadísticas del profesional desde reservas (ganancias, este mes, completados/rechazados)
  app.get("/api/professional/stats", authenticateJWT, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      if (req.user?.role !== "professional") return res.status(403).json({ message: "Se requiere rol de profesional" });
      const provider = await storage.getProviderByUserId(userId);
      if (!provider) {
        return res.json({
          completedCount: 0,
          rejectedCount: 0,
          totalEarnings: 0,
          earningsThisMonth: 0,
          earningsLastMonth: 0,
          pendingOrActiveCount: 0,
        });
      }
      const bookings = await storage.getBookingsByProvider((provider as { id: number }).id);
      const completed = bookings.filter((b: { status?: string }) => b.status === "completed");
      const rejected = bookings.filter((b: { status?: string }) => b.status === "rejected");
      const completedCount = completed.length;
      const rejectedCount = rejected.length;
      const totalEarnings = completed.reduce((sum: number, b: { cost?: number }) => {
        const cost = typeof b.cost === "number" ? b.cost : Number(b.cost) || 0;
        return sum + calcProviderNet(cost);
      }, 0);
      const now = new Date();
      const thisYear = now.getFullYear();
      const thisMonth = now.getMonth();
      const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1;
      const lastMonthYear = thisMonth === 0 ? thisYear - 1 : thisYear;
      const toDate = (v: unknown): Date | null => {
        if (v instanceof Date) return v;
        if (v && typeof (v as { toDate?: () => Date }).toDate === "function") return (v as { toDate: () => Date }).toDate();
        if (typeof v === "string" || typeof v === "number") return new Date(v);
        return null;
      };
      let earningsThisMonth = 0;
      let earningsLastMonth = 0;
      for (const b of completed) {
        const cost = typeof b.cost === "number" ? b.cost : Number(b.cost) || 0;
        const completedAt = toDate((b as { completedAt?: unknown }).completedAt);
        if (completedAt) {
          if (completedAt.getFullYear() === thisYear && completedAt.getMonth() === thisMonth) earningsThisMonth += calcProviderNet(cost);
          if (completedAt.getFullYear() === lastMonthYear && completedAt.getMonth() === lastMonth) earningsLastMonth += calcProviderNet(cost);
        }
      }
      const pendingOrActiveCount = bookings.filter(
        (b: { status?: string }) => b.status === "pending" || b.status === "confirmed" || b.status === "in_progress"
      ).length;
      res.json({
        completedCount,
        rejectedCount,
        totalEarnings,
        earningsThisMonth,
        earningsLastMonth,
        pendingOrActiveCount,
      });
    } catch (error) {
      console.error("Error fetching professional stats:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // POST /api/wallet/recharge-request - Usuario autenticado solicita recarga (crea transferencia en aprobación)
  const rechargeRequestSchema = z.object({
    amount: z.number().positive("amount debe ser positivo"),
    transferDate: z.string().min(1, "transferDate es requerido"),
    transferTime: z.string().optional(),
    transferCode: z.string().optional(),
  });
  app.post("/api/wallet/recharge-request", authenticateJWT, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const parsed = rechargeRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Datos inválidos", errors: parsed.error.flatten() });
      }
      const user = await storage.getUserById(userId);
      if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
      const name = [user.name, (user as { lastName?: string }).lastName].filter(Boolean).join(" ").trim() || "Usuario";
      const description = `Recarga al usuario ${name}`;
      const { users: adminUsers } = await storage.getUsers({ role: "admin", page: 1, limit: 1, name: "", email: "", lastName: "" });
      const fromUserId = adminUsers?.length ? (adminUsers[0] as { id?: string }).id ?? null : null;
      const transfer = await storage.createTransfer({
        userId,
        fromUserId,
        amount: parsed.data.amount,
        transferType: "recharge",
        status: "pending_approval",
        description,
        referenceId: parsed.data.transferCode,
        currency: "USD",
      });

      // Notificación interna (Socket.io) a admins para alerta en tiempo real
      const io = getIO();
      if (io) {
        const adminNotification = {
          type: "recharge_pending",
          data: {
            message: "Nueva solicitud de recarga",
            transferId: (transfer as { id?: number }).id,
            userId,
            amount: parsed.data.amount,
            userName: name,
          },
          timestamp: new Date(),
        };
        sendNotificationToAdmins(io, adminNotification);
        console.log("[recharge] Notificación interna emitida a admins, transferId:", (transfer as { id?: number }).id);
      } else {
        console.warn("[recharge] getIO() es null: no se pudo enviar notificación en tiempo real a admins");
      }

      // Notificar a todos los admins: nueva recarga pendiente de aprobación (FCM)
      const { users: allAdmins } = await storage.getUsers({
        role: "admin",
        page: 1,
        limit: 100,
        name: "",
        email: "",
        lastName: "",
      });
      const amountStr = new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(parsed.data.amount);
      const tid = (transfer as { id?: number }).id;
      const adminPushUrl = tid != null ? `/admin?tab=recargas&highlight=${tid}` : "/admin?tab=recargas";
      void Promise.all(
        (allAdmins ?? []).map((admin: { id?: string }) =>
          notificationService.sendPushToUser(admin.id!, {
            title: "Nueva solicitud de recarga",
            body: `${name} ha solicitado una recarga de ${amountStr}. Revisa el panel de administración.`,
            data: {
              type: "recharge_pending",
              url: adminPushUrl,
              transferId: String(tid ?? ""),
            },
          })
        )
      ).catch((err) => console.error("[push] Error notificando a admins por recarga:", err));

      res.status(201).json(transfer);
    } catch (error: any) {
      if (error?.message === "Usuario no encontrado") {
        return res.status(404).json({ message: error.message });
      }
      console.error("Error creating recharge request:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // POST /api/wallet/transfers - Crear transferencia (solo admin)
  const createTransferSchema = z.object({
    userId: z.string().min(1, "userId es requerido"),
    fromUserId: z.string().nullable().optional(),
    amount: z.number().positive("amount debe ser positivo"),
    transferType: z.enum(["service_payment", "recharge"]),
    status: z.enum(["pending_approval", "completed", "rejected"]).optional(),
    description: z.string().optional(),
    referenceId: z.string().optional(),
    currency: z.string().optional(),
  });
  app.post("/api/wallet/transfers", authenticateJWT, async (req: any, res) => {
    try {
      if (req.user?.role !== "admin") {
        return res.status(403).json({ message: "Se requiere rol de administrador" });
      }
      const parsed = createTransferSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Datos inválidos", errors: parsed.error.flatten() });
      }
      const transfer = await storage.createTransfer(parsed.data);
      const data = parsed.data;

      if (data.status === "completed" && data.userId && data.amount != null) {
        const amountFormatted = new Intl.NumberFormat("es-EC", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(data.amount);
        const message = `Recibiste $${amountFormatted} USD`;
        const payload = {
          type: "balance_credited",
          data: { amount: data.amount, amountFormatted, message },
          timestamp: new Date(),
        };

        await storage.createNotification({
          userId: data.userId,
          type: "balance_credited",
          data: { amount: data.amount, amountFormatted, message },
        });

        const io = getIO();
        if (io) {
          sendNotificationToUser(io, data.userId, payload);
        }

        void notificationService
          .sendPushToUser(data.userId, {
            title: "Saldo acreditado",
            body: message,
            data: { type: "balance_credited", url: "/movimientos" },
          })
          .catch((err) => console.error("[push] Error notificando saldo acreditado:", err));
      }

      res.status(201).json(transfer);
    } catch (error: any) {
      if (error?.message === "Usuario no encontrado") {
        return res.status(404).json({ message: error.message });
      }
      console.error("Error creating transfer:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/admin/wallet/transfers - Listar todas las transferencias (solo admin)
  app.get("/api/admin/wallet/transfers", authenticateJWT, async (req: any, res) => {
    try {
      if (req.user?.role !== "admin") {
        return res.status(403).json({ message: "Se requiere rol de administrador" });
      }
      const result = await storage.getAllTransfers();
      res.json(result);
    } catch (error) {
      console.error("Error fetching all wallet transfers:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // PATCH /api/admin/wallet/transfers/:id - Actualizar estado de una transferencia (solo admin)
  const updateTransferStatusSchema = z.object({
    status: z.enum(["pending_approval", "completed", "rejected"], {
      errorMap: () => ({ message: "status debe ser pending_approval, completed o rejected" }),
    }),
  });
  app.patch("/api/admin/wallet/transfers/:id", authenticateJWT, async (req: any, res) => {
    try {
      if (req.user?.role !== "admin") {
        return res.status(403).json({ message: "Se requiere rol de administrador" });
      }
      const transferId = req.params.id as string;
      if (!transferId?.trim()) {
        return res.status(400).json({ message: "ID de transferencia es requerido" });
      }
      const parsed = updateTransferStatusSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Datos inválidos", errors: parsed.error.flatten() });
      }
      const transfer = await storage.updateTransferStatus(transferId, parsed.data.status);
      const newStatus = parsed.data.status;

      // Notificar al usuario cuando su recarga pasa a aprobada o rechazada (interna Socket.io + FCM push)
      if (newStatus === "completed" || newStatus === "rejected") {
        const uid = (transfer as { userId?: string; amount?: number }).userId;
        const amount = (transfer as { amount?: number }).amount;
        const amountFormatted =
          typeof amount === "number"
            ? new Intl.NumberFormat("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)
            : "0.00";
        if (uid) {
          const notifType = newStatus === "completed" ? "recharge_completed" : "recharge_rejected";
          const payload = {
            type: notifType,
            data: { amount, amountFormatted },
            timestamp: new Date(),
          };

          // Notificación interna (Socket.io): si tiene la app abierta ve la alerta al instante
          const io = getIO();
          if (io) {
            sendNotificationToUser(io, uid, payload);
            console.log("[recharge] Notificación interna emitida al usuario", uid, "estado:", newStatus);
          }

          // Push FCM para cuando no tiene la app abierta
          if (newStatus === "completed") {
            void notificationService
              .sendPushToUser(uid, {
                title: "¡Recarga Aprobada!",
                body: `Se han acreditado $${amountFormatted} USD a tu saldo. Ya puedes usar tu dinero en la plataforma.`,
                data: { type: "recharge_completed", url: "/movimientos" },
              })
              .catch((err) => console.error("[push] Error notificando recarga aprobada:", err));
          } else {
            void notificationService
              .sendPushToUser(uid, {
                title: "Solicitud de Recarga Rechazada",
                body: `Tu solicitud por $${amountFormatted} USD no pudo ser procesada. Por favor, verifica los datos del comprobante o contacta a soporte.`,
                data: { type: "recharge_rejected", url: "/movimientos" },
              })
              .catch((err) => console.error("[push] Error notificando recarga rechazada:", err));
          }
        }
      }

      res.json(transfer);
    } catch (error: any) {
      if (error?.message === "Transferencia no encontrada") {
        return res.status(404).json({ message: error.message });
      }
      if (error?.message === "Usuario no encontrado") {
        return res.status(404).json({ message: error.message });
      }
      console.error("Error updating transfer status:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ---------- DOCUMENTOS (BÓVEDA) ----------
  
  // GET /api/documents - Listar documentos del usuario
  app.get("/api/documents", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const type = req.query.type as string | undefined;
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const documents = await storage.getDocumentsByUser(userId, type);
      res.json(documents);
    } catch (error) {
      console.error("Error fetching documents:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // POST /api/documents - Subir documento
  app.post("/api/documents", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const data = uploadDocumentSchema.parse(req.body);
      
      // En una implementación real, aquí se subiría el archivo a storage
      const document = await storage.createDocument({
        ...data,
        userId,
        encryptedPath: `/encrypted/${userId}/${Date.now()}_${data.name}`,
        status: "pending",
      });
      
      res.status(201).json(document);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error uploading document:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // DELETE /api/documents/:id - Eliminar documento
  app.delete("/api/documents/:id", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      await storage.deleteDocument(Number(req.params.id), userId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting document:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/support/admin - Obtener un administrador para soporte (para abrir chat).
  // Nota: accesible solo a usuarios autenticados (Chat requiere autenticación).
  app.get("/api/support/admin", authenticateJWT, async (req: any, res) => {
    try {
      const { users } = await storage.getUsers({ role: "admin", page: 1, limit: 1, name: "", email: "", lastName: "" });
      const admin = Array.isArray(users) && users.length ? users[0] : null;
      const adminId = admin && typeof (admin as any).id === "string" ? (admin as any).id : (admin && (admin as any).id != null ? String((admin as any).id) : null);
      if (!adminId) {
        return res.status(404).json({ message: "No hay administrador disponible" });
      }
      res.json({ adminId });
    } catch (error) {
      console.error("Error in /api/support/admin:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // ---------- MENSAJES (CHAT) ----------
  
  // GET /api/conversations - Listar conversaciones (enriquecidas con otro participante y último mensaje)
  app.get("/api/conversations", authenticateJWT, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const raw = await storage.getConversationsByUser(userId);
      const enriched = await Promise.all(
        raw.map(async (c: any) => {
          const otherId = c.participant1Id === userId ? c.participant2Id : c.participant1Id;
          const otherUser = await storage.getUserById(otherId) as { id: string; name?: string; lastName?: string } | undefined;
          let lastMessageText: string | null = null;
          let unreadCount = 0;
          const convId = Number(c.id);
          if (convId != null && !Number.isNaN(convId)) {
            try {
              const [lastMsg, unread] = await Promise.all([
                storage.getLastMessageByConversation(convId),
                storage.getUnreadCountByConversation(convId, userId),
              ]);
              lastMessageText = lastMsg?.content ?? null;
              unreadCount = unread;
            } catch (err) {
              console.error("Error enriching conversation", c.id, err);
            }
          }
          const name = otherUser ? [otherUser.name, otherUser.lastName].filter(Boolean).join(" ") || "Usuario" : "Usuario";
          return {
            ...c,
            otherParticipant: { id: String(otherUser?.id ?? otherId), name },
            lastMessageText,
            unreadCount,
          };
        })
      );
      res.json(enriched);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // POST /api/conversations - Crear conversación
  app.post("/api/conversations", authenticateJWT, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const participantId = req.body.participantId as string;
      const serviceId = req.body.serviceId as number | undefined;

      const conversation = await storage.createConversation({
        participant1Id: userId,
        participant2Id: participantId,
        serviceId,
      });
      res.status(201).json(conversation);
    } catch (error) {
      console.error("Error creating conversation:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/conversations/:id/messages - Mensajes paginados (más viejos arriba, más nuevos abajo)
  app.get("/api/conversations/:id/messages", authenticateJWT, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const conversationId = Number(req.params.id);
      const convs = await storage.getConversationsByUser(userId);
      const conv = convs.find((c: any) => Number(c.id) === conversationId);
      if (!conv) return res.status(403).json({ message: "No tienes acceso a esta conversación" });
      const limit = Math.min(Math.max(Number(req.query.limit) || CHAT_MESSAGES_PAGE_SIZE, 1), 100);
      const before = req.query.before != null ? Number(req.query.before) : undefined;
      const { messages, hasMore } = await storage.getMessagesByConversation(conversationId, { limit, before: before && !Number.isNaN(before) ? before : undefined });
      res.json({ messages, hasMore });
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // PATCH /api/conversations/:id/read - Marcar conversación como leída
  app.patch("/api/conversations/:id/read", authenticateJWT, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const conversationId = Number(req.params.id);
      const convs = await storage.getConversationsByUser(userId);
      const conv = convs.find((c: any) => Number(c.id) === conversationId);
      if (!conv) return res.status(403).json({ message: "No tienes acceso a esta conversación" });
      await storage.markConversationAsRead(conversationId, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking conversation as read:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // POST /api/messages - Enviar mensaje (solo si el usuario es participante de la conversación)
  app.post("/api/messages", authenticateJWT, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const data = sendMessageSchema.parse(req.body);
      const convs = await storage.getConversationsByUser(userId);
      const conv = convs.find((c: any) => Number(c.id) === data.conversationId);
      if (!conv) return res.status(403).json({ message: "No tienes acceso a esta conversación" });
      const message = await storage.createMessage({
        ...data,
        senderId: userId,
        status: "sent",
      });
      const recipientId =
        conv.participant1Id === userId ? conv.participant2Id : conv.participant1Id;
      const recipientIdStr = String(recipientId);

      await storage.createNotification({
        userId: recipientIdStr,
        type: "message",
        data: {
          conversationId: message.conversationId,
          preview: message.content.slice(0, 120),
          messageId: message.id,
        },
      });

      const io = getIO();
      if (io) {
        io.to(`user:${recipientIdStr}`).emit("notification:message", {
          conversationId: message.conversationId,
          preview: message.content.slice(0, 120),
          messageId: message.id,
        });
      }

      void notificationService.sendNewMessageNotification({
        recipientId,
        conversationId: message.conversationId,
        preview: message.content.slice(0, 120),
        senderId: userId,
      });
      res.status(201).json(message);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error sending message:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ---------- NOTIFICACIONES ----------

  // POST /api/notifications/register-token - Registrar token FCM del usuario autenticado
  app.post("/api/notifications/register-token", authenticateJWT, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const token = (req.body?.token as string | undefined)?.trim();
      if (!token) return res.status(400).json({ message: "token es requerido" });
      console.log("[push] Usuario aceptó notificaciones push — userId:", String(userId));
      await notificationService.registerDeviceToken(userId, token);
      res.status(204).send();
    } catch (error) {
      console.error("Error registering push token:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // PATCH /api/messages/:id/read - Marcar mensaje como leído
  app.patch("/api/messages/:id/read", authenticateJWT, async (req, res) => {
    try {
      await storage.markMessageAsRead(Number(req.params.id));
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking message as read:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // ---------- ROLES DE USUARIO ----------
  
  // GET /api/users/me/role - Obtener rol del usuario
  app.get("/api/users/me/role", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const userRole = await storage.getUserRole(userId);
      res.json(userRole);
    } catch (error) {
      console.error("Error fetching user role:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // PATCH /api/users/me/role - Actualizar rol del usuario
  app.patch("/api/users/me/role", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const data = updateUserRoleSchema.parse(req.body);
      const userRole = await storage.updateUserRole(userId, data);
      res.json(userRole);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error updating user role:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // ---------- REPORTES FINANCIEROS ----------
  
  // GET /api/reports/financial - Obtener reportes financieros
  app.get("/api/reports/financial", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const period = req.query.period as string | undefined;
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const reports = await storage.getFinancialReports(userId, period);
      res.json(reports);
    } catch (error) {
      console.error("Error fetching financial reports:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // GET /api/reports/kpis - Obtener KPIs financieros
  app.get("/api/reports/kpis", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const kpis = await storage.getKPIs(userId);
      res.json(kpis);
    } catch (error) {
      console.error("Error fetching KPIs:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // ---------- NOTIFICACIONES ----------
  
  // GET /api/notifications - Listar notificaciones (usuario autenticado por JWT)
  app.get("/api/notifications", authenticateJWT, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const unreadOnly = req.query.unread === "true";
      const notifications = await storage.getNotifications(String(userId), unreadOnly);
      res.json(notifications);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // PATCH /api/notifications/:id/read - Marcar notificación como leída
  app.patch("/api/notifications/:id/read", authenticateJWT, async (req: any, res) => {
    try {
      await storage.markNotificationAsRead(Number(req.params.id));
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking notification as read:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // ---------- INTEGRACIÓN CON APP MANGO ----------
  
  // POST /api/mango/sync - Sincronizar con ManGo
  app.post("/api/mango/sync", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const mangoUserId = req.body.mangoUserId as string;
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const sync = await storage.syncWithMango(userId, mangoUserId);
      res.json(sync);
    } catch (error) {
      console.error("Error syncing with ManGo:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // GET /api/mango/sync/status - Estado de sincronización
  app.get("/api/mango/sync/status", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const status = await storage.getMangoSyncStatus(userId);
      res.json(status);
    } catch (error) {
      console.error("Error fetching ManGo sync status:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  console.log("✅ GenFeb S.A.S. routes registered");
  
  // =====================================================
  // NUEVAS RUTAS (Inspiradas en BookingDo SaaS)
  // =====================================================
  
  // ---------- ESTADOS DE RESERVA PERSONALIZABLES ----------
  
  // GET /api/booking-statuses - Listar estados de reserva
  app.get("/api/booking-statuses", async (req, res) => {
    try {
      const statuses = await storage.getBookingStatuses();
      res.json(statuses);
    } catch (error) {
      console.error("Error fetching booking statuses:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // POST /api/booking-statuses - Crear estado de reserva
  app.post("/api/booking-statuses", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const status = await storage.createBookingStatus(req.body);
      res.status(201).json(status);
    } catch (error) {
      console.error("Error creating booking status:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // PATCH /api/booking-statuses/:id - Actualizar estado
  app.patch("/api/booking-statuses/:id", async (req, res) => {
    try {
      const status = await storage.updateBookingStatusCustom(Number(req.params.id), req.body);
      if (!status) {
        return res.status(404).json({ message: "Status not found" });
      }
      res.json(status);
    } catch (error) {
      console.error("Error updating booking status:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // DELETE /api/booking-statuses/:id - Eliminar estado
  app.delete("/api/booking-statuses/:id", async (req, res) => {
    try {
      await storage.deleteBookingStatus(Number(req.params.id));
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting booking status:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // ---------- IMPUESTOS (TAXES) ----------
  
  // GET /api/taxes - Listar impuestos
  app.get("/api/taxes", async (req, res) => {
    try {
      const taxes = await storage.getTaxes();
      res.json(taxes);
    } catch (error) {
      console.error("Error fetching taxes:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // POST /api/taxes - Crear impuesto
  app.post("/api/taxes", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const tax = await storage.createTax(req.body);
      res.status(201).json(tax);
    } catch (error) {
      console.error("Error creating tax:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // PATCH /api/taxes/:id - Actualizar impuesto
  app.patch("/api/taxes/:id", async (req, res) => {
    try {
      const tax = await storage.updateTax(Number(req.params.id), req.body);
      if (!tax) {
        return res.status(404).json({ message: "Tax not found" });
      }
      res.json(tax);
    } catch (error) {
      console.error("Error updating tax:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // DELETE /api/taxes/:id - Eliminar impuesto
  app.delete("/api/taxes/:id", async (req, res) => {
    try {
      await storage.deleteTax(Number(req.params.id));
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting tax:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // POST /api/taxes/calculate - Calcular impuesto
  app.post("/api/taxes/calculate", async (req, res) => {
    try {
      const { amount, taxIds } = req.body;
      const calculated = await storage.calculateTaxes(amount, taxIds);
      res.json(calculated);
    } catch (error) {
      console.error("Error calculating taxes:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // ---------- CUPONES / DESCUENTOS ----------
  
  // GET /api/coupons - Listar cupones
  app.get("/api/coupons", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const coupons = await storage.getCoupons(userId);
      res.json(coupons);
    } catch (error) {
      console.error("Error fetching coupons:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // POST /api/coupons - Crear cupón
  app.post("/api/coupons", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const coupon = await storage.createCoupon(req.body);
      res.status(201).json(coupon);
    } catch (error) {
      console.error("Error creating coupon:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // POST /api/coupons/validate - Validar cupón
  app.post("/api/coupons/validate", async (req, res) => {
    try {
      const { code, serviceId, categoryId, amount, userId } = req.body;
      const validation = await storage.validateCoupon(code, serviceId, categoryId, amount, userId);
      res.json(validation);
    } catch (error) {
      console.error("Error validating coupon:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // PATCH /api/coupons/:id - Actualizar cupón
  app.patch("/api/coupons/:id", async (req, res) => {
    try {
      const coupon = await storage.updateCoupon(Number(req.params.id), req.body);
      if (!coupon) {
        return res.status(404).json({ message: "Coupon not found" });
      }
      res.json(coupon);
    } catch (error) {
      console.error("Error updating coupon:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // DELETE /api/coupons/:id - Eliminar cupón
  app.delete("/api/coupons/:id", async (req, res) => {
    try {
      await storage.deleteCoupon(Number(req.params.id));
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting coupon:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // ---------- SERVICIOS ADICIONALES (ADD-ONS) ----------
  
  // GET /api/services/:id/addons - Listar add-ons de un servicio
  app.get("/api/services/:serviceId/addons", async (req, res) => {
    try {
      const addons = await storage.getServiceAddons(Number(req.params.serviceId));
      res.json(addons);
    } catch (error) {
      console.error("Error fetching service addons:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // POST /api/services/:serviceId/addons - Crear add-on
  app.post("/api/services/:serviceId/addons", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const addon = await storage.createServiceAddon({
        ...req.body,
        serviceId: Number(req.params.serviceId),
      });
      res.status(201).json(addon);
    } catch (error) {
      console.error("Error creating service addon:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // PATCH /api/addons/:id - Actualizar add-on
  app.patch("/api/addons/:id", async (req, res) => {
    try {
      const addon = await storage.updateServiceAddon(Number(req.params.id), req.body);
      if (!addon) {
        return res.status(404).json({ message: "Addon not found" });
      }
      res.json(addon);
    } catch (error) {
      console.error("Error updating service addon:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // DELETE /api/addons/:id - Eliminar add-on
  app.delete("/api/addons/:id", async (req, res) => {
    try {
      await storage.deleteServiceAddon(Number(req.params.id));
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting service addon:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // ---------- BOOKINGS MEJORADOS ----------
  
  // POST /api/bookings/calculate - Calcular total de reserva
  app.post("/api/bookings/calculate", async (req, res) => {
    try {
      const { serviceId, addonIds, couponCode, userId } = req.body;
      const calculation = await storage.calculateBookingTotal(serviceId, addonIds, couponCode, userId);
      res.json(calculation);
    } catch (error) {
      console.error("Error calculating booking:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // GET /api/bookings/:id/addons - Obtener add-ons de una reserva
  app.get("/api/bookings/:id/addons", async (req, res) => {
    try {
      const addons = await storage.getBookingAddons(Number(req.params.id));
      res.json(addons);
    } catch (error) {
      console.error("Error fetching booking addons:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // POST /api/bookings/:id/addons - Agregar add-on a reserva
  app.post("/api/bookings/:id/addons", async (req, res) => {
    try {
      const bookingAddon = await storage.addBookingAddon({
        ...req.body,
        bookingId: Number(req.params.id),
      });
      res.status(201).json(bookingAddon);
    } catch (error) {
      console.error("Error adding booking addon:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // ---------- CONFIGURACIÓN (BANCOS) ----------
  
  // Lista de bancos de Ecuador
  const ECUADOR_BANKS = [
    { id: "pichincha", name: "Banco Pichincha", account: "XXXX-XXXX-XXXX-1234" },
    { id: "guayaquil", name: "Banco Guayaquil", account: "XXXX-XXXX-XXXX-5678" },
    { id: "produbanco", name: "Produbanco", account: "XXXX-XXXX-XXXX-9012" },
    { id: "bancoazuay", name: "Banco del Azuay", account: "XXXX-XXXX-XXXX-3456" },
    { id: "bancomunicipal", name: "Banco Municipal", account: "XXXX-XXXX-XXXX-7890" },
  ];
  
  // GET /api/config/banks - Obtener lista de bancos disponibles
  app.get("/api/config/banks", async (req, res) => {
    try {
      res.json(ECUADOR_BANKS);
    } catch (error) {
      console.error("Error fetching banks:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // Schema de validación para voucher de pago
  const createVoucherSchema = z.object({
    bank: z.string().min(1, "Bank is required"),
    voucherNumber: z.string().min(1, "Voucher number is required"),
    date: z.string().min(1, "Date is required"),
    time: z.string().min(1, "Time is required"),
    amount: z.number().positive("Amount must be positive"),
    serviceName: z.string().min(1, "Service name is required"),
    notes: z.string().optional(),
  });
  
  // POST /api/payments/voucher - Enviar voucher de pago
  app.post("/api/payments/voucher", authenticateJWT, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const data = createVoucherSchema.parse(req.body);
      
      // Validar que el banco existe
      const bank = ECUADOR_BANKS.find(b => b.id === data.bank);
      if (!bank) {
        return res.status(400).json({ message: "Invalid bank" });
      }
      
      // Crear el voucher en storage
      const voucher = await storage.createPaymentVoucher({
        userId,
        bankId: data.bank,
        bankName: bank.name,
        bankAccount: bank.account,
        voucherNumber: data.voucherNumber,
        date: new Date(data.date),
        time: data.time,
        amount: data.amount,
        serviceName: data.serviceName,
        notes: data.notes,
        status: "pending",
      });
      
      res.status(201).json({ success: true, voucher });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error submitting voucher:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // GET /api/payments/vouchers - Listar vouchers del usuario
  app.get("/api/payments/vouchers", authenticateJWT, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const vouchers = await storage.getPaymentVouchersByUser(userId);
      res.json(vouchers);
    } catch (error) {
      console.error("Error fetching vouchers:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  console.log("✅ BookingDo-inspired routes registered");
  
  return httpServer;
}

// Esquemas de validación adicionales
const updateBookingSchema = z.object({
  status: z.enum(["pending", "confirmed", "in_progress", "completed", "cancelled"]),
});
