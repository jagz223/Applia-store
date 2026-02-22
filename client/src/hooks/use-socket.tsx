import { useEffect, useState, useCallback, createContext, useContext } from "react";
import { io, Socket } from "socket.io-client";
import { useAuth } from "./use-auth";

interface Notification {
  id: string;
  type: string;
  data: any;
  timestamp: Date;
  read: boolean;
}

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  notifications: Notification[];
  clearNotifications: () => void;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
  notifications: [],
  clearNotifications: () => {},
});

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    
    if (!isAuthenticated || !token) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
        setIsConnected(false);
      }
      return;
    }

    // Connect to socket server
    const newSocket = io(window.location.origin, {
      auth: { token },
      transports: ["websocket", "polling"],
    });

    newSocket.on("connect", () => {
      console.log("🔌 Connected to GenFeb socket server");
      setIsConnected(true);
    });

    newSocket.on("disconnect", () => {
      console.log("🔌 Disconnected from GenFeb socket server");
      setIsConnected(false);
    });

    newSocket.on("connected", (data: any) => {
      console.log("✅ Socket authenticated:", data);
    });

    newSocket.on("notification", (notification: any) => {
      console.log("🔔 New notification:", notification);
      setNotifications((prev) => [
        {
          id: Date.now().toString(),
          type: notification.type,
          data: notification,
          timestamp: new Date(),
          read: false,
        },
        ...prev,
      ]);
    });

    newSocket.on("notification:message", (notification: any) => {
      console.log("🔔 New message notification:", notification);
      setNotifications((prev) => [
        {
          id: Date.now().toString(),
          type: "message",
          data: notification,
          timestamp: new Date(),
          read: false,
        },
        ...prev,
      ]);
    });

    newSocket.on("notification:booking", (notification: any) => {
      console.log("🔔 New booking notification:", notification);
      setNotifications((prev) => [
        {
          id: Date.now().toString(),
          type: "booking",
          data: notification,
          timestamp: new Date(),
          read: false,
        },
        ...prev,
      ]);
    });

    newSocket.on("notification:admin", (notification: any) => {
      console.log("🔔 Admin notification:", notification);
      setNotifications((prev) => [
        {
          id: Date.now().toString(),
          type: "admin",
          data: notification,
          timestamp: new Date(),
          read: false,
        },
        ...prev,
      ]);
    });

    newSocket.on("error", (error: any) => {
      console.error("Socket error:", error);
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [isAuthenticated]);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  const value = {
    socket,
    isConnected,
    notifications,
    clearNotifications,
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}

// Helper hook to join/leave chat rooms
export function useSocketChat(conversationId: string | null) {
  const { socket } = useSocket();

  useEffect(() => {
    if (!socket || !conversationId) return;

    socket.emit("join:chat", conversationId);

    return () => {
      socket.emit("leave:chat", conversationId);
    };
  }, [socket, conversationId]);
}

// Helper hook to send messages via socket
export function useSocketMessages() {
  const { socket } = useSocket();
  const { user } = useAuth();

  const sendMessage = useCallback(
    (conversationId: string, recipientId: string, message: any) => {
      if (!socket) return;

      socket.emit("message:send", {
        conversationId,
        recipientId,
        message: {
          ...message,
          senderId: user?.id,
          timestamp: new Date(),
        },
      });
    },
    [socket, user]
  );

  return { sendMessage };
}

// Helper hook for booking notifications
export function useSocketBookings() {
  const { socket } = useSocket();

  const notifyNewBooking = useCallback(
    (providerId: string, booking: any) => {
      if (!socket) return;

      socket.emit("booking:create", {
        providerId,
        booking,
      });
    },
    [socket]
  );

  const notifyBookingUpdate = useCallback(
    (userId: string, booking: any) => {
      if (!socket) return;

      socket.emit("booking:update", {
        userId,
        booking,
      });
    },
    [socket]
  );

  return { notifyNewBooking, notifyBookingUpdate };
}
