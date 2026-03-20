import { useMemo, useState } from "react";
import { useLocation, Link } from "wouter";
import { Info, ArrowLeft, Bell, MessageSquare, Calendar, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { useSocket } from "@/hooks/use-socket";

const PAGE_SIZE = 10;

function getNotificationPath(notification: { type: string; data?: any }): string {
  const data = notification.data ?? {};
  switch (notification.type) {
    case "message":
      return data.conversationId != null ? `/chat?conversation=${encodeURIComponent(data.conversationId)}` : "/chat";
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
      if (data.type === "withdrawal_requested") return "/admin?tab=payouts";
      if (data.type === "withdrawal_processed_by_other") return "/admin?tab=payouts";
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

function getIcon(type: string) {
  switch (type) {
    case "message":
      return <MessageSquare className="h-4 w-4 text-blue-500" />;
    case "booking":
      return <Calendar className="h-4 w-4 text-green-500" />;
    case "admin":
      return <Shield className="h-4 w-4 text-orange-500" />;
    case "booking_confirmed_by_provider":
      return <Bell className="h-4 w-4 text-green-500" />;
    case "booking_confirmed_by_client":
      return <Calendar className="h-4 w-4 text-green-500" />;
    case "booking_cancelled":
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
    case "withdrawal_rejected":
      return <Bell className="h-4 w-4 text-green-500" />;
    default:
      return <Bell className="h-4 w-4 text-gray-500" />;
  }
}

function getTitle(type: string, data?: any): string {
  const d = data ?? {};
  if (type === "booking" && d.type === "new_booking") return "Nueva reserva";
  if (type === "booking" && d.type === "booking_update") {
    const status = (d.booking?.status ?? d.booking?.status) as string | undefined;
    if (status === "in_progress") return "Servicio en proceso";
    if (status === "completed") return "Servicio completado";
    return "Reserva actualizada";
  }
  if (type === "booking_confirmed_by_provider") return "Reserva confirmada por el profesional";
  if (type === "booking_confirmed_by_client") return "Fondos agregados";
  if (type === "booking_cost_commission_reminder") return "Recordatorio de comisión";
  if (type === "booking_cancelled") return "Reserva cancelada";
  if (type === "booking_cancelled_by_provider") return "Servicio cancelado";
  if (type === "booking_schedule_changed") return "Se cambió la fecha del servicio";
  if (type === "booking_cost_changed") return "Se actualizó el monto del servicio";

  if (type === "recharge_completed") return "Recarga aprobada";
  if (type === "recharge_rejected") return "Recarga rechazada";
  if (type === "balance_credited") return "Saldo acreditado";

  if (type === "withdrawal_approved") return "Retiro procesado";
  if (type === "withdrawal_rejected") return "Retiro rechazado";

  if (type === "admin") {
    if (d.type === "recharge_pending") return "Nueva solicitud de recarga";
    if (d.type === "withdrawal_requested") return "Nueva solicitud de retiro";
    if (d.type === "withdrawal_processed_by_other") {
      return d.action === "rejected" ? "Retiro rechazado por otro admin" : "Retiro aprobado por otro admin";
    }
    return "Notificación del administrador";
  }

  if (type === "message") return "Nuevo mensaje";
  return "Notificación";
}

function getDescription(type: string, data?: any): string | null {
  const d = data ?? {};
  // Booking update (Socket.io) con estado real
  if (type === "booking" && d.type === "booking_update") {
    const status = d.booking?.status as string | undefined;
    if (status === "in_progress") return "El profesional marcó tu reserva como en proceso. Revisa tu lista de reservas.";
    if (status === "completed") return "El servicio fue completado. Puedes revisar la reserva y dejar tu calificación cuando corresponda.";
    return "La reserva fue actualizada.";
  }
  // 1) Mensajes de reserva (comunes)
  if (type === "booking_confirmed_by_client") {
    const amount = d.amountFormatted ?? d.data?.amountFormatted;
    const providerNet = d.providerNetFormatted ?? d.data?.providerNetFormatted;
    const commission = d.commissionFormatted ?? d.data?.commissionFormatted;
    if (amount && providerNet && commission) {
      return `Se te han retenido $${amount} USD. Recibirás $${providerNet} USD (90%) y la plataforma tomará $${commission} USD (10%). Completa el servicio para liberar los fondos.`;
    }
    if (amount) return `Se te han retenido $${amount} USD. Completa el servicio para liberar los fondos.`;
  }
  if (type === "booking_schedule_changed") {
    const dateFormatted = d.dateFormatted ?? d.data?.dateFormatted;
    return dateFormatted ? `Nueva fecha y hora: ${dateFormatted}.` : "Se cambió la fecha del servicio. Revisa tu reserva.";
  }
  if (type === "booking_cost_changed") {
    const amount = d.amountFormatted ?? d.data?.amountFormatted;
    return amount ? `Nuevo monto: $${amount} USD. Revisa tu reserva.` : "Se ha actualizado el monto del servicio. Revisa tu reserva.";
  }
  if (type === "booking_cost_commission_reminder") {
    const amountFormatted = d.amountFormatted ?? d.data?.amountFormatted;
    const providerNetFormatted = d.providerNetFormatted ?? d.data?.providerNetFormatted;
    const commissionFormatted = d.commissionFormatted ?? d.data?.commissionFormatted;
    if (amountFormatted && providerNetFormatted && commissionFormatted) {
      return `Al acordar $${amountFormatted} USD, recibirás $${providerNetFormatted} USD (90%). Comisión de plataforma: $${commissionFormatted} USD (10%).`;
    }
    return "Recuerda que al confirmar el pago recibirás el 90% del monto acordado.";
  }

  // 2) Wallet / retiros / recargas
  if (type === "balance_credited") {
    const message = d.data?.message ?? d.message;
    if (message) return String(message);
    const amount = d.data?.amountFormatted ?? d.amountFormatted;
    if (amount != null) return `Recibiste $${amount} USD`;
  }
  if (type === "withdrawal_approved") {
    const message = d.message ?? d.data?.message;
    const adminNote = d.adminNote ?? d.data?.adminNote;
    if (message) return adminNote ? `${message} Nota: ${adminNote}` : String(message);
  }
  if (type === "withdrawal_rejected") {
    const message = d.message ?? d.data?.message;
    const adminNote = d.adminNote ?? d.data?.adminNote;
    if (message) return adminNote ? `${message} Nota: ${adminNote}` : String(message);
  }

  // 3) Mensaje explícito guardado en la notificación (fallback)
  if (typeof d.message === "string" && d.message.trim()) return d.message;
  if (typeof d.data?.message === "string" && d.data.message.trim()) return d.data.message;

  // 4) Notificaciones de admin (p. ej. solicitudes de retiro)
  if (type === "admin") {
    if (d.type === "withdrawal_requested") {
      const name = d.userName ?? d.data?.userName;
      const amount = d.amountFormatted ?? d.data?.amountFormatted ?? d.amount ?? d.data?.amount;
      if (name && amount) return `${name} solicitó retirar $${amount} USD. Revisa Solicitudes de Retiro en el Panel de Administración.`;
      return "Un profesional solicitó retirar fondos. Revisa la pestaña Solicitudes de Retiro en el Panel de Administración.";
    }
    if (d.type === "withdrawal_processed_by_other") {
      if (typeof d.message === "string") return d.message;
      if (typeof d.data?.message === "string") return d.data.message;
      return "El retiro fue procesado por otro administrador. Revisa Solicitudes de Retiro.";
    }
  }

  return null;
}

export default function Notifications() {
  const { isAuthenticated } = useAuth();
  const { notifications, markNotificationAsRead } = useSocket();
  const [, setLocation] = useLocation();

  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);

  const filtered = useMemo(() => (unreadOnly ? notifications.filter((n) => !n.read) : notifications), [notifications, unreadOnly]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), totalPages);

  const pageNotifications = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    return filtered.slice(start, end);
  }, [filtered, currentPage]);

  const handleClearFilter = () => {
    setUnreadOnly(false);
    setPage(1);
  };

  const handleOpenNotification = (notification: any) => {
    markNotificationAsRead(notification.id);
    setLocation(getNotificationPath(notification));
  };

  if (!isAuthenticated) {
    return (
      <div className="container max-w-4xl py-12 px-4">
        <Card className="border-border bg-card">
          <CardContent className="pt-6">
            <p className="text-muted-foreground text-center mb-4">Debes iniciar sesión para ver el historial de notificaciones.</p>
            <Button asChild className="w-full sm:w-auto">
              <Link href="/login">Iniciar sesión</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-5xl py-8 sm:py-12 px-4">
      <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
        <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-primary" asChild>
          <Link href="/dashboard">
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Link>
        </Button>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant={unreadOnly ? "default" : "outline"} size="sm" onClick={() => { setUnreadOnly((v) => !v); setPage(1); }}>
            {unreadOnly ? "Solo no leídas" : "Mostrar no leídas"}
          </Button>
          {(unreadOnly || page !== 1) && (
            <Button variant="ghost" size="sm" className="text-xs" onClick={handleClearFilter}>
              Limpiar filtro
            </Button>
          )}
        </div>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight flex items-center gap-2">
          <Info className="h-8 w-8 text-primary" />
          Historial de notificaciones
        </h1>
        <p className="text-muted-foreground mt-1">
          Se muestran {filtered.length} notificaciones{unreadOnly ? " no leídas" : ""}.
        </p>
      </div>

      <Card className="border-border bg-card shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg">Listado</CardTitle>
          <CardDescription>Ordenadas de la más reciente a la más antigua.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {pageNotifications.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No hay notificaciones para mostrar.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {pageNotifications.map((notification: any) => {
                const data = notification.data ?? {};
                const title = getTitle(notification.type, data);
                const detail = getDescription(notification.type, data) ?? undefined;

                return (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={() => handleOpenNotification(notification)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors hover:bg-muted/80 focus:outline-none focus:ring-2 focus:ring-primary/20 ${
                      notification.read ? "bg-muted/50" : "bg-muted"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {getIcon(notification.type)}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{title}</p>
                        {detail && <p className="text-xs text-muted-foreground mt-0.5">{detail}</p>}
                        <p className="text-xs text-muted-foreground mt-1">
                          {notification.timestamp instanceof Date
                            ? notification.timestamp.toLocaleString()
                            : new Date(notification.timestamp).toLocaleString()}
                        </p>
                      </div>
                      {!notification.read && <Badge variant="default" className="h-2 w-2 p-0 rounded-full" />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="mt-4 flex items-center justify-between gap-3">
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
        </CardContent>
      </Card>
    </div>
  );
}

