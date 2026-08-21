import { useEffect, useMemo, useState } from "react";
import { Bell, Shield, Trash2, BellRing, Loader2, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSocket } from "@/hooks/use-socket";
import { Link, useLocation } from "wouter";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { useAuth } from "@/hooks/use-auth";
import {
  getNotificationCardClassName,
  getNotificationTitleClassName,
} from "@/lib/notification-card-ui";
import { cn } from "@/lib/utils";
import {
  getStoreNotificationBody,
  getStoreNotificationTitle,
} from "@shared/store-notification-copy";
import { getStoreNotificationPath } from "@/lib/notification-path";

export function NotificationBell() {
  const { notifications, clearNotifications, isConnected, markNotificationAsRead } = useSocket();
  const push = usePushNotifications();
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);

  const PAGE_SIZE = 10;

  const visibleNotifications = notifications;

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(visibleNotifications.length / PAGE_SIZE)),
    [visibleNotifications.length],
  );
  const currentPage = Math.min(Math.max(1, page), totalPages);

  const pageNotifications = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    return visibleNotifications.slice(start, end);
  }, [visibleNotifications, currentPage]);

  const unreadCount = visibleNotifications.filter((n) => !n.read).length;

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
    const path = getStoreNotificationPath(notification);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    }
    setLocation(path);
    setOpen(false);
  };

  const getIcon = (type: string) => {
    if (
      type === "store_order_new" ||
      type === "store_order_status" ||
      type === "store_order_delivery" ||
      type === "store_subscription_result" ||
      type === "admin_store_subscription_payment"
    ) {
      return <ShoppingBag className="h-4 w-4 text-primary" />;
    }
    if (type === "account_change_request_approved" || type === "account_change_request_rejected") {
      return <Shield className="h-4 w-4 text-green-500" />;
    }
    if (type === "admin") {
      return <Shield className="h-4 w-4 text-orange-500" />;
    }
    return <Bell className="h-4 w-4 text-gray-500" />;
  };

  const getDescription = (type: string, data?: any) => {
    const storeBody = getStoreNotificationBody(type, data);
    if (storeBody) return storeBody;
    if (type === "account_change_request_approved" || type === "account_change_request_rejected") {
      const msg = data?.message ?? data?.data?.message;
      if (typeof msg === "string" && msg.trim()) return msg.trim();
      return type === "account_change_request_approved"
        ? "Abre Configuración para ver los cambios."
        : "Revisa el detalle en Configuración.";
    }
    if (type === "admin" && data?.type === "go_panic") {
      const nested = data?.data ?? {};
      const det = typeof data?.details === "string" ? data.details : typeof nested.details === "string" ? nested.details : "";
      const t = det.trim();
      return t.length > 0 ? (t.length > 160 ? `${t.slice(0, 160)}…` : t) : "Alerta de pánico. Toca para ver el detalle.";
    }
    const msg = data?.message ?? data?.data?.message;
    return typeof msg === "string" && msg.trim() ? msg.trim() : null;
  };

  const getTitle = (type: string, data?: any) => {
    const storeTitle = getStoreNotificationTitle(type, data);
    if (storeTitle) return storeTitle;
    if (type === "account_change_request_approved" || type === "account_change_request_rejected") {
      const t = data?.title ?? data?.data?.title;
      if (typeof t === "string" && t.trim()) return t.trim();
      return type === "account_change_request_approved" ? "Cambio aprobado" : "Cambio rechazado";
    }
    if (type === "admin" && data?.type === "go_panic") return "Alerta de pánico";
    if (type === "admin") return "Notificación del administrador";
    return "Notificación";
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "relative inline-flex h-10 w-10 items-center justify-center rounded-full bg-muted/70 text-foreground transition-colors",
            "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary/40",
            unreadCount > 0 && "text-secondary",
          )}
          aria-label={unreadCount > 0 ? `${unreadCount} notificaciones sin leer` : "Notificaciones"}
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-secondary px-1 text-[0.6rem] font-bold text-secondary-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
          {isConnected ? (
            <span className="absolute bottom-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500 ring-2 ring-card" />
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[21.5rem] overflow-hidden rounded-2xl border border-border/70 bg-card p-0 shadow-xl"
        align="end"
        sideOffset={10}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border/60 bg-gradient-to-r from-primary/8 via-secondary/8 to-accent/8 px-4 py-3.5">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Notificaciones</h3>
            <p className="text-xs text-muted-foreground">
              {unreadCount > 0 ? `${unreadCount} sin leer` : "Todo al día"}
            </p>
          </div>
          {visibleNotifications.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearNotifications}
              className="h-8 rounded-full text-xs text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="mr-1 h-3 w-3" />
              Limpiar
            </Button>
          ) : null}
        </div>

        {visibleNotifications.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
              <Bell className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No hay notificaciones</p>
            <p className="mt-1 text-xs text-muted-foreground">Te avisaremos cuando haya novedades</p>
          </div>
        ) : (
          <div className="max-h-96 space-y-2 overflow-y-auto px-3 py-3">
            {pageNotifications.map((notification) => {
              const title = getTitle(notification.type, notification.data);
              const description = getDescription(notification.type, notification.data);
              return (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => handleNotificationClick(notification)}
                  className={getNotificationCardClassName({ read: notification.read })}
                >
                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-muted">
                      {getIcon(notification.type)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={getNotificationTitleClassName()}>{title}</p>
                      {description ? (
                        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
                      ) : null}
                      <p className="mt-1 text-[0.65rem] text-muted-foreground/80">
                        {notification.timestamp instanceof Date
                          ? notification.timestamp.toLocaleString()
                          : new Date(notification.timestamp).toLocaleString()}
                      </p>
                    </div>
                    {!notification.read ? <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-secondary" /> : null}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {visibleNotifications.length > PAGE_SIZE && currentPage === 1 ? (
          <div className="flex items-center justify-center px-3 pb-2">
            <button
              type="button"
              onClick={() => setPage(2)}
              className="text-xs text-muted-foreground underline transition-colors hover:text-foreground"
              aria-label="Ver mas notificaciones"
            >
              +{visibleNotifications.length - PAGE_SIZE} notificaciones mas
            </button>
          </div>
        ) : null}

        {visibleNotifications.length > PAGE_SIZE && totalPages > 1 ? (
          <div className="flex items-center justify-between gap-2 border-t border-border/60 px-3 py-2">
            <Button variant="ghost" size="sm" className="rounded-full" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}>
              Anterior
            </Button>
            <span className="text-xs text-muted-foreground">
              {currentPage}/{totalPages}
            </span>
            <Button variant="ghost" size="sm" className="rounded-full" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
              Siguiente
            </Button>
          </div>
        ) : null}

        {currentPage > 1 ? (
          <div className="flex items-center justify-center px-3 pb-2">
            <Button variant="ghost" size="sm" className="rounded-full text-xs" onClick={() => setPage(1)}>
              Volver a las nuevas
            </Button>
          </div>
        ) : null}

        <div className="space-y-1.5 border-t border-border/60 bg-muted/30 px-3 py-3">
          <Link
            href="/notifications"
            className="block rounded-xl px-3 py-2 text-center text-xs font-medium text-primary transition-colors hover:bg-card"
            onClick={() => setOpen(false)}
          >
            Ver historial completo
          </Link>
          <Button
            variant="ghost"
            size="sm"
            className="h-auto w-full justify-start rounded-xl px-3 py-2 font-normal text-muted-foreground hover:text-foreground"
            onClick={() => push.register()}
            disabled={
              !push.isSupported ||
              push.isRegistering ||
              (push.permission === "granted" && push.token != null)
            }
          >
            {push.isRegistering ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : push.permission === "granted" && push.token ? (
              <Bell className="mr-2 h-4 w-4 text-emerald-500" />
            ) : (
              <BellRing className="mr-2 h-4 w-4" />
            )}
            <span className="text-xs">
              {push.isRegistering
                ? "Activando..."
                : push.permission === "granted" && push.token
                  ? "Avisos en el navegador activos"
                  : "Recibir avisos en el navegador"}
            </span>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
