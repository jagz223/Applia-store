import type { Express } from "express";
import type { Server } from "http";
import { storage as genFebStorage } from "./storage-genfeb";
import { z } from "zod";

// Usar storage de GenFeb para las nuevas funcionalidades
const storage = genFebStorage;

// ============== ESQUEMAS DE VALIDACIÓN ==============

// Booking schemas
const createBookingSchema = z.object({
  serviceId: z.number(),
  providerId: z.number(),
  date: z.string().datetime(),
  notes: z.string().optional(),
  location: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
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
  type: z.enum(["text", "image", "file"]).default("text"),
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
  app.get("/api/bookings", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
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
  
  // POST /api/bookings - Crear nueva reserva
  app.post("/api/bookings", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const data = createBookingSchema.parse(req.body);
      // Cast to any since InMemoryStorage accepts flexible booking data
      const booking = await storage.createBooking({
        serviceId: data.serviceId,
        providerId: data.providerId,
        date: new Date(data.date),
        notes: data.notes,
        location: data.location,
        latitude: data.latitude,
        longitude: data.longitude,
        userId,
        status: "pending",
      } as any);
      
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
  app.patch("/api/bookings/:id/status", async (req, res) => {
    try {
      const data = updateBookingSchema.parse(req.body);
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
  
  // GET /api/conversations - Listar conversaciones
  app.get("/api/conversations", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const conversations = await storage.getConversationsByUser(userId);
      res.json(conversations);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // POST /api/conversations - Crear conversación
  app.post("/api/conversations", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const participantId = req.body.participantId as string;
      const serviceId = req.body.serviceId as number | undefined;
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
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
  
  // GET /api/conversations/:id/messages - Obtener mensajes
  app.get("/api/conversations/:id/messages", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const messages = await storage.getMessagesByConversation(Number(req.params.id));
      res.json(messages);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // POST /api/messages - Enviar mensaje
  app.post("/api/messages", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const data = sendMessageSchema.parse(req.body);
      
      const message = await storage.createMessage({
        ...data,
        senderId: userId,
        status: "sent",
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
  
  // PATCH /api/messages/:id/read - Marcar mensaje como leído
  app.patch("/api/messages/:id/read", async (req, res) => {
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
  
  // GET /api/notifications - Listar notificaciones
  app.get("/api/notifications", async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const unreadOnly = req.query.unread === "true";
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const notifications = await storage.getNotifications(userId, unreadOnly);
      res.json(notifications);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // PATCH /api/notifications/:id/read - Marcar notificación como leída
  app.patch("/api/notifications/:id/read", async (req, res) => {
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
  
  return httpServer;
}

// Esquemas de validación adicionales
const updateBookingSchema = z.object({
  status: z.enum(["pending", "confirmed", "in_progress", "completed", "cancelled"]),
});
