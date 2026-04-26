import { Server as HttpServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { isFullAdmin } from "@shared/roles";
import { registerCargoMobilitySocket } from "./mobility-rides";
import { registerPackMobilitySocket } from "./pack-rides";

const JWT_SECRET = process.env.JWT_SECRET || "genfeb-jwt-secret-key-2024";

interface ConnectedUser {
  userId: string;
  socketId: string;
}

// Store connected users
const connectedUsers: Map<string, ConnectedUser> = new Map();
/** Última ruta/pantalla visible del usuario (para condicionar push). */
const userActivePath: Map<string, string> = new Map();

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

  io.on("connection", (socket: Socket) => {
    const user = socket.data.user;
    console.log(`🔌 User connected: ${user.email} (${socket.id})`);

    // Store user connection
    connectedUsers.set(user.id, { userId: user.id, socketId: socket.id });

    // Join user's personal room
    socket.join(`user:${user.id}`);

    // Ruta activa (SPA): el cliente reporta su ubicación para decidir si enviar push.
    socket.on("go:path", (data: { path?: string }) => {
      const p = typeof data?.path === "string" ? data.path : "";
      if (!p) return;
      userActivePath.set(String(user.id), p);
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
      userActivePath.delete(String(user.id));
    });

    // Send confirmation to client
    socket.emit("connected", {
      message: "Connected to GenFeb real-time server",
      userId: user.id,
    });
  });

  ioInstance = io;
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

export function getUserActivePath(userId: string): string | null {
  return userActivePath.get(String(userId)) ?? null;
}

export { connectedUsers };
