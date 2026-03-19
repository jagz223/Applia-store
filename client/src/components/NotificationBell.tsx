import { useEffect, useMemo, useState } from "react";
import { Bell, MessageSquare, Calendar, Shield, Trash2, BellRing, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { useSocket } from "@/hooks/use-socket";
import { Link, useLocation } from "wouter";
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
      if (data.type === "booking_update") {
        const bookingId = data.booking?.id ?? data.bookingId;
        if (bookingId != null) {
          const q = new URLSearchParams({ highlight: String(bookingId) });
          return `/bookings?${q.toString()}`;
        }
        return "/bookings";
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
    case "booking_cancelled_by_provider": {
      const bookingId = data.bookingId ?? data.data?.bookingId;
      if (bookingId != null) {
        const q = new URLSearchParams({ highlight: String(bookingId) });
        return `/bookings?${q.toString()}`;
      }
      return "/bookings";
    }
    case "booking_cost_commission_reminder": {
      const bookingId = data.bookingId ?? data.data?.bookingId;
      if (bookingId != null) {
        const q = new URLSearchParams({ tab: "bookings", highlight: String(bookingId) });
        return `/professional-dashboard?${q.toString()}`;
      }
      return "/professional-dashboard?tab=bookings";
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
  const [page, setPage] = useState(1);

  const PAGE_SIZE = 10;
  const totalPages = useMemo(() => Math.max(1, Math.ceil(notifications.length / PAGE_SIZE)), [notifications.length]);
  const currentPage = Math.min(Math.max(1, page), totalPages);

  const pageNotifications = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    return notifications.slice(start, end);
  }, [notifications, currentPage]);

  useEffect(() => {
    if (!open) return;
    // Reiniciamos a la página 1 cada vez que se abre la campana.
    setPage(1);
  }, [open]);

  useEffect(() => {
    // Si cambian las notificaciones y reducimos el total de páginas, ajustamos el estado.
    if (page !== currentPage) setPage(currentPage);
  }, [currentPage, page]);

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
      case "booking_cancelled_by_provider":
        return <Calendar className="h-4 w-4 text-red-500" />;
      case "booking_schedule_changed":
      case "booking_cost_changed":
        return <Calendar className="h-4 w-4 text-amber-500" />;
      case "booking_cost_commission_reminder":
        return <Calendar className="h-4 w-4 text-blue-500" />;
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
      const providerNet = (data as any)?.providerNetFormatted ?? (data as any)?.data?.providerNetFormatted;
      const commission = (data as any)?.commissionFormatted ?? (data as any)?.data?.commissionFormatted;
      if (amount && providerNet && commission) {
        return `Se te han retenido $${amount} USD. Recibirás $${providerNet} USD (90%) y la plataforma tomará $${commission} USD (10%). Completa el servicio para liberar los fondos.`;
      }
      if (amount) return `Se te han retenido $${amount} USD. Completa el servicio para liberar los fondos.`;
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
    if (type === "booking_cost_commission_reminder") {
      const amountFormatted = (data as any)?.amountFormatted ?? (data as any)?.data?.amountFormatted;
      const providerNetFormatted = (data as any)?.providerNetFormatted ?? (data as any)?.data?.providerNetFormatted;
      const commissionFormatted = (data as any)?.commissionFormatted ?? (data as any)?.data?.commissionFormatted;
      if (amountFormatted && providerNetFormatted && commissionFormatted) {
        return `Al acordar ${"$"}${amountFormatted} USD, recibirás ${"$"}${providerNetFormatted} USD (90%). Comisión de plataforma: ${"$"}${commissionFormatted} USD (10%).`;
      }
      return "Recuerda que al confirmar el pago recibirás el 90% del monto acordado.";
    }
    if (type === "booking" && data?.type === "booking_update") {
      const status = (data as any)?.booking?.status as string | undefined;
      if (status === "in_progress") return "El profesional marcó tu reserva como en proceso. Revisa tu lista de reservas.";
      if (status === "completed") return "El servicio fue completado. Puedes revisar la reserva y dejar tu calificación cuando corresponda.";
      return "La reserva fue actualizada.";
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
    if (type === "booking_cancelled_by_provider") {
      const message = data?.message ?? data?.data?.message;
      return message ?? "El profesional canceló el servicio. El monto fue devuelto a tu billetera.";
    }
    if (type === "booking_cancelled") {
      const message = data?.message ?? data?.data?.message;
      return message ?? null;
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
    if (type === "booking" && data?.type === "booking_update") {
      const status = (data as any)?.booking?.status as string | undefined;
      if (status === "in_progress") return "Servicio en proceso";
      if (status === "completed") return "Servicio completado";
      return "Reserva actualizada";
    }
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
    if (type === "booking_cost_commission_reminder") return "Recordatorio de comisión";
    if (type === "booking_cancelled") return "Reserva cancelada";
    if (type === "booking_cancelled_by_provider") return "Servicio cancelado";
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
            {pageNotifications.map((notification) => (
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

        {notifications.length > PAGE_SIZE && currentPage === 1 && (
          <div className="mt-2 flex items-center justify-center">
            <button
              type="button"
              onClick={() => setPage(2)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors underline"
              aria-label="Ver más notificaciones"
            >
              +{notifications.length - PAGE_SIZE} notificaciones más
            </button>
          </div>
        )}

        {notifications.length > PAGE_SIZE && totalPages > 1 && (
          <div className="mt-3 flex items-center justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}>
              Anterior
            </Button>
            <span className="text-xs text-muted-foreground">
              Página {currentPage}/{totalPages}
            </span>
            <Button variant="ghost" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
              Siguiente
            </Button>
          </div>
        )}

        {currentPage > 1 && (
          <div className="mt-2 flex items-center justify-center">
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => setPage(1)}>
              Limpiar filtro (volver a las nuevas)
            </Button>
          </div>
        )}

        <div className="mt-3">
          <Link
            href="/notifications"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors underline"
            onClick={() => setOpen(false)}
          >
            Ver historial completo
          </Link>
        </div>

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
