import { useEffect, useMemo, useState } from "react";
import { Bell, MessageSquare, Calendar, Shield, Trash2, BellRing, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { useSocket } from "@/hooks/use-socket";
import { Link, useLocation } from "wouter";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { useConversations } from "@/hooks/use-chat";
import { useAuth } from "@/hooks/use-auth";

/** Devuelve la ruta a la que debe ir el usuario al hacer clic en la notificaci?n (con highlight para resaltar el elemento). */
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
    case "verification_welcome":
      return "/professional-dashboard";
    case "verification_result": {
      const step = data.step ?? data.data?.step;
      const st = data.status ?? data.data?.status;
      if (step === "transaction" && st === "verified") {
        const fromServer = data.url ?? data.data?.url;
        if (typeof fromServer === "string" && fromServer.includes("tab=invoices")) {
          return fromServer.startsWith("/") ? fromServer : `/${fromServer}`;
        }
        const q = new URLSearchParams({ tab: "invoices", verificationInvoice: "1" });
        const reportId = data.reportId ?? data.data?.reportId;
        if (reportId != null) q.set("reportId", String(reportId));
        return `/professional-dashboard?${q.toString()}`;
      }
      return typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/professional-dashboard";
    }
    default:
      return "/dashboard";
  }
}

export function NotificationBell() {
  const { notifications, clearNotifications, isConnected, markNotificationAsRead } = useSocket();
  const push = usePushNotifications();
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);

  const PAGE_SIZE = 10;
  const totalPages = useMemo(() => Math.max(1, Math.ceil(notifications.length / PAGE_SIZE)), [notifications.length]);
  const currentPage = Math.min(Math.max(1, page), totalPages);

  const { data: conversations } = useConversations(!!isAuthenticated);
  const senderNameByConversationId = useMemo(() => {
    const map = new Map<number, string>();
    (conversations ?? []).forEach((c) => map.set(c.id, c.otherParticipant?.name ?? "Usuario"));
    return map;
  }, [conversations]);

  const truncate = (s: string, max: number) => {
    const t = s.trim();
    return t.length > max ? `${t.slice(0, max)}...` : t;
  };

  const pageNotifications = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    return notifications.slice(start, end);
  }, [notifications, currentPage]);

  useEffect(() => {
    if (!open) return;
    // Reiniciamos a la pagina 1 cada vez que se abre la campana.
    setPage(1);
  }, [open]);

  useEffect(() => {
    // Si cambian las notificaciones y reducimos el total de paginas, ajustamos el estado.
    if (page !== currentPage) setPage(currentPage);
  }, [currentPage, page]);

  const handleNotificationClick = (notification: { id: string; type: string; data?: any }) => {
    markNotificationAsRead(notification.id);
    const path = getNotificationPath(notification);
    if (typeof window !== "undefined") {
      // Evita que el SPA conserve el scroll del historial de notificaciones.
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    }
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

  const getDescription = (type: string, data?: any) => {
    if (type === "booking" && data?.type === "new_booking") {
      return "Tienes una nueva solicitud de reserva. Revisa el detalle en tu Panel Asociado.";
    }
    if (type === "message") {
      const d = data ?? {};
      const convId = d.conversationId ?? d.data?.conversationId;
      const senderName =
        convId != null && Number.isFinite(Number(convId)) ? senderNameByConversationId.get(Number(convId)) : undefined;
      const preview = typeof d.preview === "string" ? d.preview : typeof d.data?.preview === "string" ? d.data.preview : "";
      const raw = preview ? preview.trim() : "";
      const lower = raw.toLowerCase();
      const looksLikeLocation =
        (lower.includes("lat") && lower.includes("lng")) ||
        lower.includes("ubicacion") ||
        lower.includes("location") ||
        lower.includes("latitud") ||
        lower.includes("longitud");
      if (looksLikeLocation) return "Te ha compartido su ubicacion.";

      const snippet = raw ? truncate(raw, 90) : "";
      if (snippet) return senderName ? `De ${senderName}: ${snippet}` : snippet;
      return senderName ? `De ${senderName}` : null;
    }
    if (type === "booking_confirmed_by_client") {
      const amount = data?.amountFormatted ?? data?.data?.amountFormatted;
      const providerNet = (data as any)?.providerNetFormatted ?? (data as any)?.data?.providerNetFormatted;
      const commission = (data as any)?.commissionFormatted ?? (data as any)?.data?.commissionFormatted;
      const provPct = (data as any)?.providerPercent ?? (data as any)?.data?.providerPercent ?? 90;
      const platPct = (data as any)?.platformPercent ?? (data as any)?.data?.platformPercent ?? 10;
      if (amount && providerNet && commission) {
        return `Se te han retenido $${amount} USD. Recibiras $${providerNet} USD (${provPct}%) y la plataforma tomara $${commission} USD (${platPct}%). Completa el servicio para liberar los fondos.`;
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
      const provPct = (data as any)?.providerPercent ?? (data as any)?.data?.providerPercent ?? 90;
      const platPct = (data as any)?.platformPercent ?? (data as any)?.data?.platformPercent ?? 10;
      if (amountFormatted && providerNetFormatted && commissionFormatted) {
        return `Al acordar ${"$"}${amountFormatted} USD, recibiras ${"$"}${providerNetFormatted} USD (${provPct}%). Comision de plataforma: ${"$"}${commissionFormatted} USD (${platPct}%).`;
      }
      return `Recuerda que al confirmar el pago recibiras el ${provPct}% del monto acordado.`;
    }
    if (type === "booking" && data?.type === "booking_update") {
      const status = (data as any)?.booking?.status as string | undefined;
      if (status === "in_progress") return "El asociado marco tu reserva como en proceso. Revisa tu lista de reservas.";
      if (status === "completed") return "El servicio fue completado. Puedes revisar la reserva y dejar tu calificacion cuando corresponda.";
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
      const message = data?.message ?? "Tu solicitud de retiro fue rechazada. Los fondos fueron devueltos a tu Saldo Genfeb.";
      const note = data?.adminNote;
      return note ? `${message} Nota: ${note}` : message;
    }
    if (type === "booking_cancelled_by_provider") {
      const message = data?.message ?? data?.data?.message;
      return message ?? "El asociado cancelo el servicio. El monto fue devuelto a tu Saldo Genfeb.";
    }
    if (type === "booking_cancelled") {
      const message = data?.message ?? data?.data?.message;
      return message ?? null;
    }
    if (type === "admin" && data?.type === "withdrawal_requested") {
      const name = data?.userName ?? data?.data?.userName;
      const amount = data?.amountFormatted ?? data?.data?.amountFormatted ?? data?.amount;
      if (name && amount) return `${name} solicito retirar $${amount} USD. Revisa Solicitudes de Retiro en el Panel de Administracion.`;
      return "Un asociado solicito retirar fondos. Revisa la pestana Solicitudes de Retiro en el Panel de Administracion.";
    }
    if (type === "admin" && data?.type === "withdrawal_processed_by_other") {
      return data?.message ?? "El retiro fue procesado por otro administrador. Revisa Solicitudes de Retiro.";
    }
    if (type === "verification_result" || type === "verification_welcome") {
      return data?.message ?? (data as any)?.data?.message ?? "Tu estado de verificación ha sido actualizado.";
    }
    if (type === "admin_verification_request") {
      return data?.message ?? (data as any)?.data?.message ?? "Se ha recibido una nueva solicitud de verificación de asociado.";
    }
    return null;
  };

  const getTitle = (type: string, data?: any) => {
    if (type === "booking" && data?.type === "new_booking") return "Nueva solicitud de reserva";
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
    if (type === "booking_confirmed_by_provider") return "Reserva confirmada por el asociado";
    if (type === "booking_confirmed_by_client") return "Fondos agregados";
    if (type === "booking_cost_commission_reminder") return "Recordatorio de comision";
    if (type === "booking_cancelled") return "Reserva cancelada";
    if (type === "booking_cancelled_by_provider") return "Servicio cancelado";
    if (type === "booking_schedule_changed") return "Se cambio la fecha del servicio";
    if (type === "booking_cost_changed") return "Se actualizo el monto del servicio";
    if (type === "withdrawal_approved") return "Retiro procesado";
    if (type === "withdrawal_rejected") return "Retiro rechazado";
    if (type === "verification_welcome") return "¡Bienvenido Asociado!";
    if (type === "admin_verification_request") {
      const step = (data as any)?.step ?? (data as any)?.data?.step;
      return step === "payment" ? "Comprobante de pago recibido" : "Nueva solicitud de Asociado";
    }
    if (type === "verification_result") {
      const step = (data as any)?.step ?? (data as any)?.data?.step;
      const status = (data as any)?.status ?? (data as any)?.data?.status;
      if (step === "identification") return status === "verified" ? "Identificación aprobada" : "Identificación rechazada";
      if (step === "transaction") return status === "verified" ? "Pago verificado" : "Pago rechazado";
      return "Resultado de verificación";
    }
    if (type === "message") {
      const d = data ?? ({} as any);
      const convId = d.conversationId ?? d.data?.conversationId;
      const senderName =
        convId != null && Number.isFinite(Number(convId)) ? senderNameByConversationId.get(Number(convId)) : undefined;
      return senderName ? `Nuevo mensaje de ${truncate(senderName, 18)}` : "Nuevo mensaje";
    }
    switch (type) {
      case "message":
        return "Nuevo mensaje";
      case "booking":
        return "Reserva actualizada";
      case "admin":
        return "Notificacion del administrador";
      default:
        return "Notificacion";
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className={`h-5 w-5 ${unreadCount > 0 ? "text-amber-300" : "text-foreground"}`} />
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
              aria-label="Ver mas notificaciones"
            >
              +{notifications.length - PAGE_SIZE} notificaciones mas
            </button>
          </div>
        )}

        {notifications.length > PAGE_SIZE && totalPages > 1 && (
          <div className="mt-3 flex items-center justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}>
              Anterior
            </Button>
            <span className="text-xs text-muted-foreground">
              Pagina {currentPage}/{totalPages}
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
              ? "Activando..."
              : push.permission === "granted" && push.token
                ? "Avisos en el navegador activos"
                : "Recibir avisos en el navegador"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
