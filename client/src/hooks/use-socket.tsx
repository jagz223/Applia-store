import { useEffect, useState, useCallback, useRef, createContext, useContext } from "react";
import { io, Socket } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./use-auth";
import { useToast } from "@/hooks/use-toast";
import { fetchNotificationsFromServer } from "@/lib/notifications-api";

const ADMIN_WALLET_TRANSFERS_KEY = "/api/admin/wallet/transfers";

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
  markNotificationAsRead: (id: string) => void;
  /** Indica en qué conversación está el usuario para no mostrar notificación de mensaje en la campana. */
  setOpenChatConversationId: (id: string | null) => void;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
  notifications: [],
  clearNotifications: () => {},
  markNotificationAsRead: () => {},
  setOpenChatConversationId: () => {},
});

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const openConversationIdRef = useRef<string | null>(null);
  const hasFetchedInitialNotifications = useRef(false);
  const userRef = useRef(user);
  userRef.current = user;

  const setOpenChatConversationId = useCallback((id: string | null) => {
    openConversationIdRef.current = id;
  }, []);

  // Al cerrar sesión: limpiar estado y resetear flag para que el próximo login vuelva a sincronizar.
  useEffect(() => {
    if (!isAuthenticated || !user) {
      hasFetchedInitialNotifications.current = false;
      setNotifications([]);
      return;
    }
  }, [isAuthenticated, user]);

  // Sincronización al iniciar sesión: una sola consulta a Firestore como fuente de verdad.
  // Socket.IO solo añadirá notificaciones en tiempo real una vez la sesión esté activa.
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    if (hasFetchedInitialNotifications.current) return;
    const token = localStorage.getItem("token");
    if (!token) return;

    hasFetchedInitialNotifications.current = true;
    fetchNotificationsFromServer(token)
      .then((list) => {
        setNotifications(list);
      })
      .catch(() => {
        hasFetchedInitialNotifications.current = false;
      });
  }, [isAuthenticated, user?.id]);

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
      // Al reconectar, refrescar reservas del profesional y notificaciones para no perder actualizaciones
      if (userRef.current?.role === "professional") {
        queryClient.invalidateQueries({ queryKey: ["/api/bookings/provider"] });
      }
      const token = localStorage.getItem("token");
      if (token) {
        fetchNotificationsFromServer(token)
          .then((list) => setNotifications(list))
          .catch(() => {});
      }
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
      // Recarga aprobada o rechazada: actualizar wallet/movimientos y avisar al usuario
      const type = notification?.type;
      if (type === "recharge_completed" || type === "recharge_rejected") {
        queryClient.invalidateQueries({ queryKey: ["/api/wallet/me"] });
        queryClient.invalidateQueries({ queryKey: ["/api/wallet/transfers"] });
        const amount = notification?.data?.amountFormatted ?? notification?.data?.amount ?? "";
        if (type === "recharge_completed") {
          toast({
            title: "Recarga aprobada",
            description: amount ? `Se han acreditado $${amount} USD a tu saldo.` : "Tu saldo ha sido actualizado.",
          });
        } else {
          toast({
            title: "Recarga rechazada",
            description: amount ? `Tu solicitud por $${amount} USD no pudo ser procesada.` : "Revisa los detalles en movimientos.",
            variant: "destructive",
          });
        }
      }
      if (type === "booking_confirmed_by_provider") {
        queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
        toast({
          title: "Reserva confirmada por el profesional",
          description: "Confirma el pago en Mis Reservas para retener los fondos.",
        });
      }
      if (type === "booking_confirmed_by_client") {
        queryClient.invalidateQueries({ queryKey: ["/api/bookings/provider"] });
        const amount = notification?.data?.amountFormatted ?? notification?.data?.amount;
        toast({
          title: "Fondos agregados",
          description: amount
            ? `Se te han agregado $${amount} USD (retenidos). Ya puedes completar el servicio.`
            : "El cliente confirmó el pago. Ya puedes iniciar o completar el trabajo.",
        });
      }
      if (type === "booking_cancelled") {
        queryClient.invalidateQueries({ queryKey: ["/api/bookings/provider"] });
        toast({
          title: "Reserva cancelada",
          description: "Un cliente canceló una reserva. Revisa tu panel de reservas.",
          variant: "destructive",
        });
      }
      if (type === "booking_schedule_changed") {
        queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
        const dateFormatted = notification?.data?.dateFormatted ?? notification?.data?.data?.dateFormatted;
        toast({
          title: "Se cambió la fecha del servicio",
          description: dateFormatted ? `Nueva fecha y hora: ${dateFormatted}. Revisa tu reserva.` : "El profesional actualizó la fecha. Revisa Mis Reservas.",
        });
      }
      if (type === "booking_cost_changed") {
        queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
        const amount = notification?.data?.amountFormatted ?? notification?.data?.data?.amountFormatted ?? notification?.data?.amount;
        toast({
          title: "Se actualizó el monto del servicio",
          description: amount != null ? `El nuevo monto es $${amount} USD. Revisa tu reserva.` : "El profesional actualizó el monto. Revisa Mis Reservas.",
        });
      }
    });

    newSocket.on("notification:message", (notification: any) => {
      const convId = notification?.conversationId != null ? String(notification.conversationId) : null;
      if (convId !== null && openConversationIdRef.current === convId) {
        return;
      }
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
      console.log("[recharge] Cliente recibió notification:admin:", notification);
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
      // Si es solicitud de recarga y el usuario es admin: refrescar tabla e informar
      const isRechargePending = notification?.type === "recharge_pending";
      if (isRechargePending && userRef.current?.role === "admin") {
        queryClient.invalidateQueries({ queryKey: [ADMIN_WALLET_TRANSFERS_KEY] });
        toast({
          title: "Nueva solicitud de recarga recibida",
          description: notification?.data?.userName
            ? `${notification.data.userName} ha solicitado una recarga. Revisa el panel de recargas.`
            : "Revisa el panel de administración.",
        });
      }
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

  const markNotificationAsRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    const numId = Number(id);
    if (Number.isInteger(numId) && numId > 0 && numId < 1000000) {
      const token = localStorage.getItem("token");
      if (token) {
        fetch(`/api/notifications/${id}/read`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {});
      }
    }
  }, []);

  const value = {
    socket,
    isConnected,
    notifications,
    clearNotifications,
    markNotificationAsRead,
    setOpenChatConversationId,
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
