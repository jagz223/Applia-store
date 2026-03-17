import { useState } from "react";
import { Bell, MessageSquare, Calendar, Shield, Trash2, BellRing, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { useSocket } from "@/hooks/use-socket";
import { useLocation } from "wouter";
import { usePushNotifications } from "@/hooks/use-push-notifications";

/** Devuelve la ruta a la que debe ir el usuario al hacer clic en la notificación (con highlight para resaltar el elemento). */
function getNotificationPath(notification: { type: string; data?: any }): string {
  const data = notification.data ?? {};
  switch (notification.type) {
    case "message":
      const convId = data.conversationId;
      return convId != null ? `/chat?conversation=${encodeURIComponent(convId)}` : "/chat";
    case "booking":
      if (data.type === "new_booking") {
        const q = new URLSearchParams({ tab: "bookings" });
        const bookingId = data.booking?.id ?? data.bookingId;
        if (bookingId != null) q.set("highlight", String(bookingId));
        return `/professional-dashboard?${q.toString()}`;
      }
      return "/bookings";
    case "booking_confirmed_by_provider": {
      const q = new URLSearchParams();
      const bookingId = data.bookingId ?? data.data?.bookingId;
      if (bookingId != null) q.set("highlight", String(bookingId));
      return q.toString() ? `/bookings?${q.toString()}` : "/bookings";
    }
    case "booking_confirmed_by_client": {
      const q = new URLSearchParams({ tab: "bookings" });
      const bookingId = data.bookingId ?? data.data?.bookingId;
      if (bookingId != null) q.set("highlight", String(bookingId));
      return `/professional-dashboard?${q.toString()}`;
    }
    case "booking_cancelled": {
      const q = new URLSearchParams({ tab: "bookings" });
      const bookingId = data.bookingId ?? data.data?.bookingId;
      if (bookingId != null) q.set("highlight", String(bookingId));
      return `/professional-dashboard?${q.toString()}`;
    }
    case "booking_schedule_changed":
    case "booking_cost_changed": {
      const q = new URLSearchParams();
      const bookingId = data.bookingId ?? data.data?.bookingId;
      if (bookingId != null) q.set("highlight", String(bookingId));
      return q.toString() ? `/bookings?${q.toString()}` : "/bookings";
    }
    case "admin":
      if (data.type === "recharge_pending") {
        const transferId = data.data?.transferId ?? data.transferId;
        const q = new URLSearchParams({ tab: "recargas" });
        if (transferId != null) q.set("highlight", String(transferId));
        return `/admin?${q.toString()}`;
      }
      if (data.type === "withdrawal_requested") {
        return "/admin?tab=payouts";
      }
      if (data.type === "withdrawal_processed_by_other") {
        return "/admin?tab=payouts";
      }
      return "/dashboard";
    case "withdrawal_approved":
    case "withdrawal_rejected":
      return "/movimientos";
    case "recharge_completed":
    case "recharge_rejected":
    case "balance_credited":
      return "/movimientos";
    default:
      return "/dashboard";
  }
}

export function NotificationBell() {
  const { notifications, clearNotifications, isConnected, markNotificationAsRead } = useSocket();
  const push = usePushNotifications();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);

  const handleNotificationClick = (notification: { id: string; type: string; data?: any }) => {
    markNotificationAsRead(notification.id);
    const path = getNotificationPath(notification);
    setLocation(path);
    setOpen(false);
    const data = notification.data ?? {};
    if (data.type === "recharge_pending") {
      const transferId = data.data?.transferId ?? data.transferId;
      window.dispatchEvent(
        new CustomEvent("admin-open-recargas", { detail: { transferId: transferId != null ? Number(transferId) : null } })
      );
    }
    if (notification.type === "booking_confirmed_by_client" || (notification.type === "booking" && data.type === "new_booking")) {
      const bookingId = data.bookingId ?? data.data?.bookingId ?? data.booking?.id;
      if (bookingId != null) {
        window.dispatchEvent(new CustomEvent("pro-open-bookings-highlight", { detail: { bookingId: Number(bookingId) } }));
      }
    }
    if (notification.type === "booking_cancelled") {
      const bookingId = data.bookingId ?? data.data?.bookingId;
      if (bookingId != null) {
        window.dispatchEvent(new CustomEvent("pro-open-bookings-highlight", { detail: { bookingId: Number(bookingId) } }));
      }
    }
    if (notification.type === "booking_confirmed_by_provider") {
      const bookingId = data.bookingId ?? data.data?.bookingId;
      if (bookingId != null) {
        window.dispatchEvent(new CustomEvent("bookings-page-highlight", { detail: { bookingId: Number(bookingId) } }));
      }
    }
    if (notification.type === "admin" && data?.type === "withdrawal_requested") {
      window.dispatchEvent(new CustomEvent("admin-open-payouts", { detail: {} }));
    }
    if (notification.type === "booking_schedule_changed" || notification.type === "booking_cost_changed") {
      const bookingId = data.bookingId ?? data.data?.bookingId;
      if (bookingId != null) {
        window.dispatchEvent(new CustomEvent("bookings-page-highlight", { detail: { bookingId: Number(bookingId) } }));
      }
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  const getIcon = (type: string) => {
    switch (type) {
      case "message":
        return <MessageSquare className="h-4 w-4 text-blue-500" />;
      case "booking":
        return <Calendar className="h-4 w-4 text-green-500" />;
      case "admin":
        return <Shield className="h-4 w-4 text-orange-500" />;
      case "booking_confirmed_by_provider":
      case "recharge_completed":
        return <Bell className="h-4 w-4 text-green-500" />;
      case "booking_confirmed_by_client":
        return <Calendar className="h-4 w-4 text-green-500" />;
      case "booking_cancelled":
        return <Calendar className="h-4 w-4 text-red-500" />;
      case "booking_schedule_changed":
      case "booking_cost_changed":
        return <Calendar className="h-4 w-4 text-amber-500" />;
      case "recharge_rejected":
        return <Bell className="h-4 w-4 text-red-500" />;
      case "withdrawal_approved":
        return <Bell className="h-4 w-4 text-green-500" />;
      case "withdrawal_rejected":
        return <Bell className="h-4 w-4 text-red-500" />;
      default:
        return <Bell className="h-4 w-4 text-gray-500" />;
    }
  };

  const getDescription = (type: string, data?: { amountFormatted?: string; dateFormatted?: string; message?: string; data?: { amountFormatted?: string; dateFormatted?: string } }) => {
    if (type === "booking_confirmed_by_client") {
      const amount = data?.amountFormatted ?? data?.data?.amountFormatted;
      if (amount) return `Se te han agregado $${amount} USD. Completa el servicio para liberar los fondos.`;
    }
    if (type === "booking_schedule_changed") {
      const dateFormatted = data?.dateFormatted ?? data?.data?.dateFormatted;
      if (dateFormatted) return `Nueva fecha y hora: ${dateFormatted}.`;
      return "Se ha cambiado la fecha del servicio. Revisa tu reserva.";
    }
    if (type === "booking_cost_changed") {
      const amount = data?.amountFormatted ?? data?.data?.amountFormatted;
      if (amount) return `Nuevo monto: $${amount} USD. Revisa tu reserva.`;
      return "Se ha actualizado el monto del servicio. Revisa tu reserva.";
    }
    if (type === "balance_credited") {
      const message = data?.data?.message ?? data?.message;
      if (message) return message;
      const amount = data?.data?.amountFormatted ?? data?.amountFormatted;
      if (amount != null) return `Recibiste $${amount} USD`;
    }
    if (type === "withdrawal_approved") {
      const message = data?.message ?? "Tu retiro fue aprobado. Tus fondos fueron enviados a la cuenta bancaria registrada.";
      const note = data?.adminNote;
      return note ? `${message} Nota: ${note}` : message;
    }
    if (type === "withdrawal_rejected") {
      const message = data?.message ?? "Tu solicitud de retiro fue rechazada. Los fondos fueron devueltos a tu billetera.";
      const note = data?.adminNote;
      return note ? `${message} Nota: ${note}` : message;
    }
    if (type === "admin" && data?.type === "withdrawal_requested") {
      const name = data?.userName ?? data?.data?.userName;
      const amount = data?.amountFormatted ?? data?.data?.amountFormatted ?? data?.amount;
      if (name && amount) return `${name} solicitó retirar $${amount} USD. Revisa Solicitudes de Retiro en el Panel de Administración.`;
      return "Un profesional solicitó retirar fondos. Revisa la pestaña Solicitudes de Retiro en el Panel de Administración.";
    }
    if (type === "admin" && data?.type === "withdrawal_processed_by_other") {
      return data?.message ?? "El retiro fue procesado por otro administrador. Revisa Solicitudes de Retiro.";
    }
    return null;
  };

  const getTitle = (type: string, data?: { type?: string }) => {
    if (type === "booking" && data?.type === "new_booking") return "Nueva reserva";
    if (type === "admin" && data?.type === "recharge_pending") return "Nueva solicitud de recarga";
    if (type === "admin" && data?.type === "withdrawal_requested") return "Nueva solicitud de retiro";
    if (type === "admin" && data?.type === "withdrawal_processed_by_other") {
      return data?.action === "rejected" ? "Retiro rechazado por otro admin" : "Retiro aprobado por otro admin";
    }
    if (type === "recharge_completed") return "Recarga aprobada";
    if (type === "recharge_rejected") return "Recarga rechazada";
    if (type === "balance_credited") return "Saldo acreditado";
    if (type === "booking_confirmed_by_provider") return "Reserva confirmada por el profesional";
    if (type === "booking_confirmed_by_client") return "Fondos agregados";
    if (type === "booking_cancelled") return "Reserva cancelada";
    if (type === "booking_schedule_changed") return "Se cambió la fecha del servicio";
    if (type === "booking_cost_changed") return "Se actualizó el monto del servicio";
    if (type === "withdrawal_approved") return "Retiro procesado";
    if (type === "withdrawal_rejected") return "Retiro rechazado";
    switch (type) {
      case "message":
        return "Nuevo mensaje";
      case "booking":
        return "Reserva actualizada";
      case "admin":
        return "Notificación del administrador";
      default:
        return "Notificación";
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
          {isConnected && (
            <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-green-500" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold">Notificaciones</h3>
          {notifications.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearNotifications}
              className="text-xs text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Limpiar
            </Button>
          )}
        </div>

        {notifications.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No hay notificaciones</p>
            <p className="text-xs">Te avisaremos cuando haya novedades</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {notifications.slice(0, 10).map((notification) => (
              <button
                key={notification.id}
                type="button"
                onClick={() => handleNotificationClick(notification)}
                className={`w-full text-left p-3 rounded-lg border transition-colors hover:bg-muted/80 focus:outline-none focus:ring-2 focus:ring-primary/20 ${
                  notification.read ? "bg-muted/50" : "bg-muted"
                }`}
              >
                <div className="flex items-start gap-2">
                  {getIcon(notification.type)}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">
                      {getTitle(notification.type, notification.data)}
                    </p>
                    {getDescription(notification.type, notification.data) && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {getDescription(notification.type, notification.data)}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {notification.timestamp instanceof Date
                        ? notification.timestamp.toLocaleString()
                        : new Date(notification.timestamp).toLocaleString()}
                    </p>
                  </div>
                  {!notification.read && (
                    <Badge variant="default" className="h-2 w-2 p-0 rounded-full" />
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        {notifications.length > 10 && (
          <p className="text-xs text-center text-muted-foreground mt-2">
            +{notifications.length - 10} notificaciones más
          </p>
        )}

        <div className="mt-4 pt-3 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-muted-foreground hover:text-foreground font-normal"
            onClick={() => push.register()}
            disabled={
              !push.isSupported ||
              push.isRegistering ||
              (push.permission === "granted" && push.token != null)
            }
          >
            {push.isRegistering ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : push.permission === "granted" && push.token ? (
              <Bell className="h-4 w-4 mr-2 text-green-500" />
            ) : (
              <BellRing className="h-4 w-4 mr-2" />
            )}
            {push.isRegistering
              ? "Activando…"
              : push.permission === "granted" && push.token
                ? "Avisos en el navegador activos"
                : "Recibir avisos en el navegador"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
