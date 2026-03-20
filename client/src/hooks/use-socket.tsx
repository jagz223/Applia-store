import { useEffect, useState, useCallback, useRef, createContext, useContext } from "react";
import { io, Socket } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./use-auth";
import { hasFullAdminRole } from "@/lib/auth-utils";
import { useToast } from "@/hooks/use-toast";
import { fetchNotificationsFromServer, type ClientNotification } from "@/lib/notifications-api";
import { debouncedRefetch } from "@/lib/refetch-utils";

const ADMIN_WALLET_TRANSFERS_KEY = "/api/admin/wallet/transfers";
const ADMIN_WITHDRAWALS_KEY = "/api/admin/withdrawals";

type Notification = ClientNotification;

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
      // Al reconectar, refrescar reservas del profesional (debounced para no saturar)
      if (userRef.current?.role === "professional") {
        queryClient.invalidateQueries({ queryKey: ["/api/bookings/provider"] });
        debouncedRefetch(queryClient, ["/api/bookings/provider"]);
      }
      const token = localStorage.getItem("token");
      if (token) {
        fetchNotificationsFromServer(token)
          .then((list) => {
            setNotifications((prev) => {
              const byId = new Map<string, Notification>();
              [...prev, ...list].forEach((n) => {
                const existing = byId.get(n.id);
                if (!existing) {
                  byId.set(n.id, n);
                } else {
                  byId.set(n.id, existing.read && !n.read ? existing : n);
                }
              });
              const merged = Array.from(byId.values());
              merged.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
              return merged;
            });
          })
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
      const id = notification?.id != null ? String(notification.id) : `${notification?.type ?? "unknown"}-${notification?.data?.id ?? Date.now().toString()}`;
      setNotifications((prev) => {
        const base: Notification = {
          id,
          type: notification.type,
          data: notification.data ?? notification,
          timestamp: new Date(),
          read: false,
        };
        const withoutDup = prev.filter((n) => n.id !== base.id);
        return [base, ...withoutDup];
      });
      // Recarga aprobada o rechazada: actualizar wallet/movimientos y avisar al usuario
      const type = notification?.type;
      if (type === "recharge_completed" || type === "recharge_rejected") {
        queryClient.invalidateQueries({ queryKey: ["/api/wallet/me"] });
        queryClient.invalidateQueries({ queryKey: ["/api/wallet/transfers"] });
        debouncedRefetch(queryClient, ["/api/wallet/me"]);
        debouncedRefetch(queryClient, ["/api/wallet/transfers"]);
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
      if (type === "balance_credited") {
        queryClient.invalidateQueries({ queryKey: ["/api/wallet/me"] });
        queryClient.invalidateQueries({ queryKey: ["/api/wallet/transfers"] });
        debouncedRefetch(queryClient, ["/api/wallet/me"]);
        debouncedRefetch(queryClient, ["/api/wallet/transfers"]);
        const message = notification?.data?.message;
        const amount = notification?.data?.amountFormatted;
        toast({
          title: "Saldo acreditado",
          description: message ?? (amount != null ? `Recibiste $${amount} USD` : "Se ha acreditado saldo a tu cuenta."),
        });
      }
      if (type === "booking_confirmed_by_provider") {
        queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
        debouncedRefetch(queryClient, ["/api/bookings"]);
        toast({
          title: "Reserva confirmada por el profesional",
          description: "Confirma el pago en Mis Reservas para retener los fondos.",
        });
      }
      if (type === "booking_confirmed_by_client") {
        queryClient.invalidateQueries({ queryKey: ["/api/bookings/provider"] });
        queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
        debouncedRefetch(queryClient, ["/api/bookings/provider"]);
        debouncedRefetch(queryClient, ["/api/bookings"]);
        debouncedRefetch(queryClient, ["/api/wallet/me"]);
        const amount = notification?.data?.amountFormatted ?? notification?.data?.amount;
        const providerNet = notification?.data?.providerNetFormatted ?? notification?.data?.providerNet;
        const commission = notification?.data?.commissionFormatted ?? notification?.data?.commission;
        toast({
          title: "Fondos agregados",
          description:
            amount && providerNet && commission
              ? `Se te han retenido $${amount} USD. Recibirás $${providerNet} USD (90%) y la plataforma tomará $${commission} USD (10%). Ya puedes completar el servicio.`
              : amount
                ? `Se te han agregado $${amount} USD (retenidos). Ya puedes completar el servicio.`
                : "El cliente confirmó el pago. Ya puedes iniciar o completar el trabajo.",
        });
      }
      if (type === "booking_cost_commission_reminder") {
        const amountFormatted = notification?.data?.amountFormatted ?? notification?.data?.amount;
        const providerNetFormatted = notification?.data?.providerNetFormatted ?? notification?.data?.providerNet;
        const commissionFormatted = notification?.data?.commissionFormatted ?? notification?.data?.commission;
        toast({
          title: "Recordatorio de comisión",
          description:
            amountFormatted && providerNetFormatted && commissionFormatted
              ? `Al acordar $${amountFormatted} USD, recibirás $${providerNetFormatted} USD (90%). Comisión: $${commissionFormatted} USD (10%).`
              : "Recuerda que el profesional recibe el 90% del monto acordado.",
        });
      }
      if (type === "booking_cancelled") {
        queryClient.invalidateQueries({ queryKey: ["/api/bookings/provider"] });
        queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
        debouncedRefetch(queryClient, ["/api/bookings/provider"]);
        debouncedRefetch(queryClient, ["/api/bookings"]);
        toast({
          title: "Reserva cancelada",
          description: "Un cliente canceló una reserva. Revisa tu panel de reservas.",
          variant: "destructive",
        });
      }
      if (type === "booking_schedule_changed") {
        queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
        debouncedRefetch(queryClient, ["/api/bookings"]);
        const dateFormatted = notification?.data?.dateFormatted ?? notification?.data?.data?.dateFormatted;
        toast({
          title: "Se cambió la fecha del servicio",
          description: dateFormatted ? `Nueva fecha y hora: ${dateFormatted}. Revisa tu reserva.` : "El profesional actualizó la fecha. Revisa Mis Reservas.",
        });
      }
      if (type === "booking_cost_changed") {
        queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
        debouncedRefetch(queryClient, ["/api/bookings"]);
        const amount = notification?.data?.amountFormatted ?? notification?.data?.data?.amountFormatted ?? notification?.data?.amount;
        toast({
          title: "Se actualizó el monto del servicio",
          description: amount != null ? `El nuevo monto es $${amount} USD. Revisa tu reserva.` : "El profesional actualizó el monto. Revisa Mis Reservas.",
        });
      }
      if (type === "withdrawal_approved") {
        queryClient.invalidateQueries({ queryKey: ["/api/wallet/me"] });
        queryClient.invalidateQueries({ queryKey: ["/api/wallet/transfers"] });
        debouncedRefetch(queryClient, ["/api/wallet/me"]);
        debouncedRefetch(queryClient, ["/api/wallet/transfers"]);
        toast({
          title: "Retiro aprobado",
          description: notification?.body ?? "Tu retiro fue aprobado. Tus fondos fueron enviados a la cuenta bancaria registrada.",
        });
      }
      if (type === "withdrawal_rejected") {
        queryClient.invalidateQueries({ queryKey: ["/api/wallet/me"] });
        queryClient.invalidateQueries({ queryKey: ["/api/wallet/transfers"] });
        debouncedRefetch(queryClient, ["/api/wallet/me"]);
        debouncedRefetch(queryClient, ["/api/wallet/transfers"]);
        toast({
          title: "Retiro rechazado",
          description: notification?.body ?? "Tu solicitud de retiro fue rechazada. Los fondos fueron devueltos a tu billetera.",
          variant: "destructive",
        });
      }
    });

    newSocket.on("notification:message", (notification: any) => {
      const convId = notification?.conversationId != null ? String(notification.conversationId) : null;
      if (convId !== null && openConversationIdRef.current === convId) {
        return;
      }
      console.log("🔔 New message notification:", notification);
      setNotifications((prev) => {
        const id = notification?.id != null ? String(notification.id) : `message-${notification?.conversationId ?? Date.now().toString()}`;
        const base: Notification = {
          id,
          type: "message",
          data: notification,
          timestamp: new Date(),
          read: false,
        };
        const withoutDup = prev.filter((n) => n.id !== base.id);
        return [base, ...withoutDup];
      });
    });

    newSocket.on("notification:booking", (notification: any) => {
      console.log("🔔 New booking notification:", notification);
      setNotifications((prev) => {
        const bookingId = notification?.bookingId ?? notification?.data?.bookingId ?? notification?.booking?.id;
        const id = bookingId != null ? `booking-${bookingId}` : `booking-${Date.now().toString()}`;
        const base: Notification = {
          id,
          type: "booking",
          data: notification,
          timestamp: new Date(),
          read: false,
        };
        const withoutDup = prev.filter((n) => n.id !== base.id);
        return [base, ...withoutDup];
      });
      // Actualizar lista de reservas del profesional (refetch debounced para no saturar servidor)
      queryClient.invalidateQueries({ queryKey: ["/api/bookings/provider"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      debouncedRefetch(queryClient, ["/api/bookings/provider"]);
      debouncedRefetch(queryClient, ["/api/bookings"]);

      // Notificación/toast más precisa para cambios de estado (in_progress/completed)
      if (notification?.type === "booking_update") {
        const status = notification?.booking?.status as string | undefined;
        if (status === "in_progress") {
          toast({
            title: "Servicio en proceso",
            description: "El profesional marcó tu reserva como en proceso. Revisa tu lista de reservas.",
          });
        } else if (status === "completed") {
          toast({
            title: "Servicio completado",
            description: "El servicio fue completado. Puedes revisar la reserva y dejar tu calificación cuando corresponda.",
          });
        }
      }
    });

    newSocket.on("notification:admin", (notification: any) => {
      console.log("[recharge] Cliente recibió notification:admin:", notification);
      setNotifications((prev) => {
        const id = notification?.id != null ? String(notification.id) : `admin-${notification?.type ?? Date.now().toString()}`;
        const base: Notification = {
          id,
          type: "admin",
          data: notification,
          timestamp: new Date(),
          read: false,
        };
        const withoutDup = prev.filter((n) => n.id !== base.id);
        return [base, ...withoutDup];
      });
      // Si es solicitud de recarga y el usuario es admin: refrescar tabla e informar
      const isRechargePending = notification?.type === "recharge_pending";
      if (isRechargePending && hasFullAdminRole(userRef.current)) {
        queryClient.invalidateQueries({ queryKey: [ADMIN_WALLET_TRANSFERS_KEY] });
        debouncedRefetch(queryClient, [ADMIN_WALLET_TRANSFERS_KEY]);
        toast({
          title: "Nueva solicitud de recarga recibida",
          description: notification?.data?.userName
            ? `${notification.data.userName} ha solicitado una recarga. Revisa el panel de recargas.`
            : "Revisa el panel de administración.",
        });
      }
      // Si es solicitud de retiro (payout): refrescar Payouts para que aparezca el usuario al instante
      const isWithdrawalRequested = notification?.type === "withdrawal_requested";
      if (isWithdrawalRequested && hasFullAdminRole(userRef.current)) {
        queryClient.invalidateQueries({ queryKey: [ADMIN_WITHDRAWALS_KEY] });
        debouncedRefetch(queryClient, [ADMIN_WITHDRAWALS_KEY]);
        toast({
          title: "Nueva solicitud de retiro",
          description: "Un profesional solicitó retirar fondos. Revisa la pestaña Solicitudes de Retiro en el Panel de Administración.",
        });
      }
      // Otro admin ya procesó el retiro (aprobado o rechazado): actualizar lista Payouts para que desaparezca el usuario
      const isWithdrawalProcessedByOther = notification?.type === "withdrawal_processed_by_other";
      if (isWithdrawalProcessedByOther && hasFullAdminRole(userRef.current)) {
        queryClient.invalidateQueries({ queryKey: [ADMIN_WITHDRAWALS_KEY] });
        debouncedRefetch(queryClient, [ADMIN_WITHDRAWALS_KEY]);
        const action = notification?.action === "approved" ? "aprobado" : "rechazado";
        const who = notification?.data?.processedByAdminName ?? "otro administrador";
        const name = notification?.data?.professionalName ?? "el usuario";
        toast({
          title: "Retiro ya procesado",
          description: `El retiro de ${name} fue ${action} por ${who}. Ya no aparece en Solicitudes de Retiro.`,
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
    setNotifications((prev) =>
      prev.map((n) => (n.read ? n : { ...n, read: true }))
    );
  }, []);

  const markNotificationAsRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    const numId = Number(id);
    if (!Number.isFinite(numId)) return;
    const token = localStorage.getItem("token");
    if (token) {
      fetch(`/api/notifications/${numId}/read`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
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
