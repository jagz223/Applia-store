import { useEffect, useMemo, useState } from "react";
import { Bell, MessageSquare, Calendar, Shield, Trash2, BellRing, Loader2, Building2, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { useSocket } from "@/hooks/use-socket";
import { Link, useLocation } from "wouter";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { useConversations } from "@/hooks/use-chat";
import { useAuth } from "@/hooks/use-auth";
import {
  NOTIFICATION_TYPE_CENTRAL_AFFILIATION,
  NOTIFICATION_TYPE_CENTRAL_AFFILIATION_APPROVED,
  NOTIFICATION_TYPE_CENTRAL_AFFILIATION_REJECTED,
  NOTIFICATION_TYPE_CENTRAL_DATA_ACCESS,
} from "@shared/central-affiliation";
import {
  centralAffiliationApplicantNotificationPath,
  centralAffiliationNotificationPath,
} from "@/lib/central-affiliation-notification-path";
import { NOTIFICATION_TYPE_ROLE_CHANGED } from "@shared/role-change-notification";
import {
  getNotificationAccentCtaClassName,
  getNotificationCardClassName,
  getNotificationTitleClassName,
} from "@/lib/notification-card-ui";
import { isGoMobilityShellPath, openChatFromNotification } from "@/lib/open-go-chat";
import {
  PUBLIC_PROMO_NOTIFICATION_CTA,
  getPublicPromoNotificationDescription,
  getPublicPromoNotificationPath,
  getPublicPromoNotificationTitle,
  isPublicPromoNotificationType,
  shouldShowPublicPromoInNotificationList,
} from "@/lib/public-promo-notification-ui";

/** Devuelve la ruta a la que debe ir el usuario al hacer clic en la notificaci?n (con highlight para resaltar el elemento). */
function getNotificationPath(notification: { id?: string; type: string; data?: any }): string {
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
      {
        // Si el servidor ya envía un destino, respetarlo.
        const u = data.url ?? data.data?.url;
        if (typeof u === "string" && u.startsWith("/")) return u;
      }
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
      if (data.type === "go_panic" && notification.id) {
        return `/notifications?detail=${encodeURIComponent(String(notification.id))}`;
      }
      // Notificaciones admin antiguas/genéricas: por defecto deben abrir el panel admin.
      return "/admin?tab=overview";
    case "admin_verification_request": {
      const u = data.url ?? data.data?.url;
      return typeof u === "string" && u.startsWith("/") ? u : "/admin?tab=overview";
    }
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
    case "account_change_request_approved":
    case "account_change_request_rejected": {
      const u = data.url ?? data.data?.url;
      return typeof u === "string" && u.startsWith("/") ? u : "/settings";
    }
    case "vehicle_change_request_approved":
    case "vehicle_change_request_rejected": {
      const u = data.url ?? data.data?.url;
      return typeof u === "string" && u.startsWith("/") ? u : "/settings";
    }
    case NOTIFICATION_TYPE_CENTRAL_AFFILIATION:
      return centralAffiliationNotificationPath(data);
    case NOTIFICATION_TYPE_CENTRAL_DATA_ACCESS:
      return centralAffiliationApplicantNotificationPath(data);
    case NOTIFICATION_TYPE_CENTRAL_AFFILIATION_APPROVED:
    case NOTIFICATION_TYPE_CENTRAL_AFFILIATION_REJECTED:
      return centralAffiliationApplicantNotificationPath(data);
    case NOTIFICATION_TYPE_ROLE_CHANGED: {
      const u = data.url ?? data.data?.url;
      return typeof u === "string" && u.startsWith("/") ? u : "/settings";
    }
    default:
      if (isPublicPromoNotificationType(notification.type)) {
        return getPublicPromoNotificationPath(data);
      }
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

  const visibleNotifications = useMemo(
    () =>
      notifications.filter((n) => {
        if (isPublicPromoNotificationType(n.type)) {
          return shouldShowPublicPromoInNotificationList(n.type);
        }
        return true;
      }),
    [notifications],
  );

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(visibleNotifications.length / PAGE_SIZE)),
    [visibleNotifications.length],
  );
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
    return visibleNotifications.slice(start, end);
  }, [visibleNotifications, currentPage]);

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
    const data = notification.data ?? {};
    if (notification.type === "message") {
      const convId = data.conversationId ?? data.data?.conversationId;
      if (convId != null) {
        const pathname = typeof window !== "undefined" ? window.location.pathname : "";
        if (isGoMobilityShellPath(pathname)) {
          openChatFromNotification({
            conversationId: convId,
            pathname,
            setLocation,
          });
          setOpen(false);
          return;
        }
      }
    }
    const path = getNotificationPath(notification);
    if (typeof window !== "undefined") {
      // Evita que el SPA conserve el scroll del historial de notificaciones.
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    }
    setLocation(path);
    setOpen(false);
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

  const unreadCount = visibleNotifications.filter((n) => !n.read).length;

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
      case "account_change_request_approved":
        return <Bell className="h-4 w-4 text-green-500" />;
      case "account_change_request_rejected":
        return <Bell className="h-4 w-4 text-amber-500" />;
      case "vehicle_change_request_approved":
        return <Bell className="h-4 w-4 text-green-500" />;
      case "vehicle_change_request_rejected":
        return <Bell className="h-4 w-4 text-amber-500" />;
      case NOTIFICATION_TYPE_CENTRAL_AFFILIATION:
      case NOTIFICATION_TYPE_CENTRAL_DATA_ACCESS:
      case NOTIFICATION_TYPE_CENTRAL_AFFILIATION_APPROVED:
        return <Building2 className="h-4 w-4 text-primary" />;
      case NOTIFICATION_TYPE_CENTRAL_AFFILIATION_REJECTED:
        return <Building2 className="h-4 w-4 text-amber-600" />;
      default:
        if (isPublicPromoNotificationType(type)) {
          return <Ticket className="h-4 w-4 text-orange-500" />;
        }
        return <Bell className="h-4 w-4 text-gray-500" />;
    }
  };

  const getDescription = (type: string, data?: any) => {
    if (isPublicPromoNotificationType(type)) {
      return getPublicPromoNotificationDescription(type, data);
    }
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
      if (status === "completed")
        return "El servicio fue completado. Ya puedes dejar tu calificación en la ventana que aparece o desde tu lista de reservas.";
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
    if (type === "admin" && data?.type === "pending_account_change_request") {
      const msg = data?.message ?? data?.data?.message;
      if (typeof msg === "string" && msg.trim()) return msg.trim();
      return "Un asociado envió una solicitud de cambio de datos o vehículo. Revisa Gestión de asociados.";
    }
    if (type === "admin" && data?.type === "withdrawal_processed_by_other") {
      return data?.message ?? "El retiro fue procesado por otro administrador. Revisa Solicitudes de Retiro.";
    }
    if (type === "admin" && data?.type === "go_panic") {
      const nested = data?.data ?? {};
      const det = typeof data?.details === "string" ? data.details : typeof nested.details === "string" ? nested.details : "";
      const t = det.trim();
      return t.length > 0 ? (t.length > 160 ? `${t.slice(0, 160)}…` : t) : "Alerta de pánico en Genfeb Go. Toca para ver el detalle completo.";
    }
    if (type === "verification_result" || type === "verification_welcome") {
      return data?.message ?? (data as any)?.data?.message ?? "Tu estado de verificación ha sido actualizado.";
    }
    if (type === "admin_verification_request") {
      return data?.message ?? (data as any)?.data?.message ?? "Se ha recibido una nueva solicitud de verificación de asociado.";
    }
    if (type === "account_change_request_approved" || type === "account_change_request_rejected") {
      const msg = data?.message ?? (data as any)?.data?.message;
      if (typeof msg === "string" && msg.trim()) return msg.trim();
      return type === "account_change_request_approved"
        ? "Abre Configuración para actualizar tu perfil."
        : "Revisa o vuelve a solicitar el cambio en Configuración.";
    }
    if (type === "vehicle_change_request_approved" || type === "vehicle_change_request_rejected") {
      const msg = data?.message ?? (data as any)?.data?.message;
      if (typeof msg === "string" && msg.trim()) return msg.trim();
      return type === "vehicle_change_request_approved"
        ? "Abre Configuración para ver tu vehículo actualizado."
        : "Revisa el motivo en Configuración o envía una nueva solicitud.";
    }
    if (type === NOTIFICATION_TYPE_CENTRAL_AFFILIATION) {
      return "Un conductor solicitó afiliarse a tu central. Revisa nombre, vehículo y documentación.";
    }
    if (type === NOTIFICATION_TYPE_CENTRAL_DATA_ACCESS) {
      return "Abre tu panel de asociado (Resumen) para revisar el alcance y ceder datos si lo deseas.";
    }
    if (type === NOTIFICATION_TYPE_CENTRAL_AFFILIATION_APPROVED || type === NOTIFICATION_TYPE_CENTRAL_AFFILIATION_REJECTED) {
      const msg = data?.message ?? (data as any)?.data?.message;
      if (typeof msg === "string" && msg.trim()) return msg.trim();
      return type === NOTIFICATION_TYPE_CENTRAL_AFFILIATION_APPROVED
        ? "Tu central aprobó tu solicitud de afiliación."
        : "Tu central no aprobó tu solicitud de afiliación.";
    }
    return null;
  };

  const getTitle = (type: string, data?: any) => {
    if (isPublicPromoNotificationType(type)) {
      return getPublicPromoNotificationTitle(type, data);
    }
    if (type === "booking" && data?.type === "new_booking") return "Nueva solicitud de reserva";
    if (type === "booking" && data?.type === "booking_update") {
      const status = (data as any)?.booking?.status as string | undefined;
      if (status === "in_progress") return "Servicio en proceso";
      if (status === "completed") return "Servicio completado";
      return "Reserva actualizada";
    }
    if (type === "admin" && data?.type === "recharge_pending") return "Nueva solicitud de recarga";
    if (type === "admin" && data?.type === "withdrawal_requested") return "Nueva solicitud de retiro";
    if (type === "admin" && data?.type === "pending_account_change_request") return "Nueva petición de asociado";
    if (type === "admin" && data?.type === "go_panic") return "Pánico Genfeb Go";
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
    if (type === "account_change_request_approved" || type === "account_change_request_rejected") {
      const t = data?.title ?? (data as any)?.data?.title;
      if (typeof t === "string" && t.trim()) return t.trim();
      const field = String(data?.field ?? (data as any)?.data?.field ?? "");
      const label =
        field === "email" ? "Correo" : field === "name" ? "Nombre" : field === "phone" ? "Teléfono" : "Perfil";
      return type === "account_change_request_approved" ? `${label}: aprobado` : `${label}: rechazado`;
    }
    if (type === "vehicle_change_request_approved" || type === "vehicle_change_request_rejected") {
      const t = data?.title ?? (data as any)?.data?.title;
      if (typeof t === "string" && t.trim()) return t.trim();
      return type === "vehicle_change_request_approved" ? "Vehículo actualizado" : "Vehículo: solicitud rechazada";
    }
    if (type === NOTIFICATION_TYPE_CENTRAL_AFFILIATION) {
      const name = data?.applicantName ?? (data as any)?.data?.applicantName ?? "Un conductor";
      const cn = data?.companyName ?? (data as any)?.data?.companyName ?? "tu central";
      return `${name} quiere unirse a ${cn}`;
    }
    if (type === NOTIFICATION_TYPE_CENTRAL_DATA_ACCESS) {
      const cn = data?.companyName ?? (data as any)?.data?.companyName ?? "Tu central";
      return `${cn} solicita acceso a tus datos de contacto`;
    }
    if (type === NOTIFICATION_TYPE_CENTRAL_AFFILIATION_APPROVED) {
      return "Afiliación aprobada";
    }
    if (type === NOTIFICATION_TYPE_CENTRAL_AFFILIATION_REJECTED) {
      return "Afiliación no aprobada";
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
          <Bell className={`h-5 w-5 ${unreadCount > 0 ? "text-primary" : "text-foreground"}`} />
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
      <PopoverContent className="w-80" align="end" sideOffset={8}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold">Notificaciones</h3>
          {visibleNotifications.length > 0 && (
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

        {visibleNotifications.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No hay notificaciones</p>
            <p className="text-xs">Te avisaremos cuando haya novedades</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {pageNotifications.map((notification) => {
              const isPromo = isPublicPromoNotificationType(notification.type);
              const title = getTitle(notification.type, notification.data);
              const description = getDescription(notification.type, notification.data);
              return (
              <button
                key={notification.id}
                type="button"
                onClick={() => handleNotificationClick(notification)}
                className={getNotificationCardClassName({ read: notification.read })}
              >
                <div className="flex items-start gap-2">
                  {getIcon(notification.type)}
                  <div className="flex-1 min-w-0">
                    <p className={getNotificationTitleClassName()}>{title}</p>
                    {description && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {description}
                      </p>
                    )}
                    {isPromo && (
                      <p className={getNotificationAccentCtaClassName()}>{PUBLIC_PROMO_NOTIFICATION_CTA}</p>
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
            );
            })}
          </div>
        )}

        {visibleNotifications.length > PAGE_SIZE && currentPage === 1 && (
          <div className="mt-2 flex items-center justify-center">
            <button
              type="button"
              onClick={() => setPage(2)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors underline"
              aria-label="Ver mas notificaciones"
            >
              +{visibleNotifications.length - PAGE_SIZE} notificaciones mas
            </button>
          </div>
        )}

        {visibleNotifications.length > PAGE_SIZE && totalPages > 1 && (
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
