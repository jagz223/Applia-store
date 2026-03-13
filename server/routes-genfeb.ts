import type { Express } from "express";
import type { Server } from "http";
import { storage as genFebStorage } from "./storage-genfeb";
import { authenticateJWT } from "./routes-auth";
import { z } from "zod";
import { notificationService } from "./services/notification.service";
import { getIO } from "./socket";

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
  
  // GET /api/bookings - Listar reservas del usuario
  app.get("/api/bookings", authenticateJWT, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const status = req.query.status as string | undefined;
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const bookings = await storage.getBookingsByUser(userId, status);
      res.json(bookings);
    } catch (error) {
      console.error("Error fetching bookings:", error);
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
      res.status(201).json(booking);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error creating booking:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // GET /api/bookings/:id - Obtener reserva por ID
  app.get("/api/bookings/:id", async (req, res) => {
    try {
      const booking = await storage.getBooking(Number(req.params.id));
      
      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }
      
      res.json(booking);
    } catch (error) {
      console.error("Error fetching booking:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // PATCH /api/bookings/:id/status - Actualizar estado de reserva
  app.patch("/api/bookings/:id/status", authenticateJWT, async (req, res) => {
    try {
      const data = updateBookingStatusSchema.parse(req.body);
      const booking = await storage.updateBookingStatus(Number(req.params.id), data.status);
      
      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
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
      const u = user as { wallet?: number; totalEarnings?: number };
      res.json({
        wallet: typeof u.wallet === "number" ? u.wallet : 0,
        totalEarnings: typeof u.totalEarnings === "number" ? u.totalEarnings : 0,
      });
    } catch (error) {
      console.error("Error fetching user wallet:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/wallet/me - Alias para wallet del usuario autenticado
  app.get("/api/wallet/me", authenticateJWT, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const user = await storage.getUserById(userId);
      if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
      const u = user as { wallet?: number; totalEarnings?: number };
      res.json({
        wallet: typeof u.wallet === "number" ? u.wallet : 0,
        totalEarnings: typeof u.totalEarnings === "number" ? u.totalEarnings : 0,
      });
    } catch (error) {
      console.error("Error fetching user wallet:", error);
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
      res.json(result);
    } catch (error) {
      console.error("Error fetching wallet transfers:", error);
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
      res.status(201).json(transfer);
    } catch (error: any) {
      if (error?.message === "Usuario no encontrado") {
        return res.status(404).json({ message: error.message });
      }
      console.error("Error creating transfer:", error);
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
