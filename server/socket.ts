import { Server as HttpServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { isFullAdmin } from "@shared/roles";
import { registerCargoMobilitySocket } from "./mobility-rides";
import { registerPackMobilitySocket } from "./pack-rides";
import { registerCentralSocket } from "./routes-central";
import { startClassicOfferReconcileLoop } from "./go-driver-classic-offer-reconcile";
import {
  clearUserGoPresence,
  updateUserGoPresence,
} from "./go-user-presence";

const JWT_SECRET = process.env.JWT_SECRET || "applia-jwt-secret-key-2024";

interface ConnectedUser {
  userId: string;
  socketId: string;
}

// Store connected users
const connectedUsers: Map<string, ConnectedUser> = new Map();

let ioInstance: SocketIOServer | null = null;

export function getIO(): SocketIOServer | null {
  return ioInstance;
}

export function initializeSocket(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
    // Render y proxies suelen cerrar conexiones inactivas antes que el default de Socket.IO.
    pingInterval: 25_000,
    pingTimeout: 60_000,
  });

  // Authentication middleware
  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error("Authentication required"));
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      socket.data.user = decoded;
      next();
    } catch (err) {
      next(new Error("Invalid token"));
    }
  });

  registerCargoMobilitySocket(io);
  registerPackMobilitySocket(io);
  registerCentralSocket(io);

  io.on("connection", (socket: Socket) => {
    const user = socket.data.user;
    console.log(`🔌 User connected: ${user.email} (${socket.id})`);

    // Store user connection
    connectedUsers.set(user.id, { userId: user.id, socketId: socket.id });

    // Join user's personal room
    socket.join(`user:${user.id}`);

    const applyGoPresence = (data: { path?: string; hidden?: boolean }) => {
      const patch: { path?: string; hidden?: boolean } = {};
      if (typeof data?.path === "string" && data.path.trim()) patch.path = data.path.trim();
      if (typeof data?.hidden === "boolean") patch.hidden = data.hidden;
      if (patch.path === undefined && patch.hidden === undefined) return;
      updateUserGoPresence(String(user.id), patch);
    };

    // Ruta + visibilidad (SPA): condicionar push de ofertas al conductor.
    socket.on("go:path", (data: { path?: string; hidden?: boolean }) => {
      applyGoPresence(data);
    });
    socket.on("go:presence", (data: { path?: string; hidden?: boolean }) => {
      applyGoPresence(data);
    });

    socket.on("driver:work_mode", (data: { mode?: string; at?: number }) => {
      const mode = data?.mode === "taxi" || data?.mode === "delivery" || data?.mode === "off" ? data.mode : null;
      if (!mode) return;
      if (process.env.NODE_ENV !== "production") {
        console.log(`[driver:work_mode] user=${user.id} mode=${mode} at=${data?.at ?? "—"}`);
      }
    });

    // Admin y Soporte TI entran al room "admin" (notificaciones internas: recargas, retiros, etc.)
    if (isFullAdmin(user.role)) {
      socket.join("admin");
      console.log(`🔔 Admin joined room: ${user.email}`);
    }

    // Handle joining chat rooms
    socket.on("join:chat", (conversationId: string) => {
      socket.join(`chat:${conversationId}`);
      console.log(`👤 User ${user.email} joined chat: ${conversationId}`);
    });

    // Handle leaving chat rooms
    socket.on("leave:chat", (conversationId: string) => {
      socket.leave(`chat:${conversationId}`);
      console.log(`👤 User ${user.email} left chat: ${conversationId}`);
    });

    // Handle new message notifications
    socket.on("message:send", (data: { conversationId: string; recipientId: string; message: any }) => {
      // Send to recipient's personal room
      io.to(`user:${data.recipientId}`).emit("notification:message", {
        type: "new_message",
        conversationId: data.conversationId,
        message: data.message,
        timestamp: new Date(),
      });
    });

    // Handle booking notifications
    socket.on("booking:create", (data: { providerId: string; booking: any }) => {
      io.to(`user:${data.providerId}`).emit("notification:booking", {
        type: "new_booking",
        booking: data.booking,
        timestamp: new Date(),
      });
    });

    socket.on("booking:update", (data: { userId: string; booking: any }) => {
      io.to(`user:${data.userId}`).emit("notification:booking", {
        type: "booking_update",
        booking: data.booking,
        timestamp: new Date(),
      });
    });

    // Handle disconnect
    socket.on("disconnect", () => {
      console.log(`🔌 User disconnected: ${user.email} (${socket.id})`);
      connectedUsers.delete(user.id);
      clearUserGoPresence(String(user.id));
    });

    // Send confirmation to client
    socket.emit("connected", {
      message: "Connected to Applia real-time server",
      userId: user.id,
    });
  });

  ioInstance = io;
  startClassicOfferReconcileLoop(() => ioInstance);
  return io;
}

// Helper function to send notification to specific user
export function sendNotificationToUser(io: SocketIOServer, userId: string, notification: any) {
  io.to(`user:${userId}`).emit("notification", notification);
}

// Helper function to send notification to all admins (only sockets in room "admin")
export function sendNotificationToAdmins(io: SocketIOServer, notification: any) {
  io.to("admin").emit("notification:admin", notification);
}

// Helper function to broadcast to all connected users
export function broadcastToAll(io: SocketIOServer, event: string, data: any) {
  io.emit(event, data);
}

export { getUserActivePath } from "./go-user-presence";

export { connectedUsers };
