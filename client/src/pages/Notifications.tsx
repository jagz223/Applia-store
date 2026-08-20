import { useEffect, useMemo, useState } from "react";
import { useLocation, Link, useSearch } from "wouter";
import { navigate } from "wouter/use-browser-location";
import { Info, ArrowLeft, Bell, Shield, ShieldCheck, ShieldAlert, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { useSocket } from "@/hooks/use-socket";
import {
  getNotificationCardClassName,
  getNotificationTitleClassName,
} from "@/lib/notification-card-ui";
import { getStoreNotificationPath } from "@/lib/notification-path";
import {
  getStoreNotificationBody,
  getStoreNotificationTitle,
} from "@shared/store-notification-copy";

const PAGE_SIZE = 10;

function getIcon(type: string, data?: Record<string, unknown>) {
  if (
    type === "store_order_new" ||
    type === "store_order_status" ||
    type === "store_order_delivery"
  ) {
    return <ShoppingBag className="h-4 w-4 text-primary" />;
  }
  if (type === "store_subscription_result") {
    return data?.status === "rejected"
      ? <ShieldAlert className="h-4 w-4 text-red-500" />
      : <ShieldCheck className="h-4 w-4 text-green-500" />;
  }
  if (type === "admin_store_subscription_payment") {
    return <Shield className="h-4 w-4 text-amber-500" />;
  }
  if (type === "admin") {
    return <Shield className="h-4 w-4 text-orange-500" />;
  }
  return <Bell className="h-4 w-4 text-gray-500" />;
}

function getTitle(type: string, data?: Record<string, unknown>): string {
  const storeTitle = getStoreNotificationTitle(type, data ?? {});
  if (storeTitle) return storeTitle;
  if (type === "account_change_request_approved" || type === "account_change_request_rejected") {
    const t = data?.title ?? (data?.data as Record<string, unknown> | undefined)?.title;
    if (typeof t === "string" && t.trim()) return t.trim();
    return type === "account_change_request_approved" ? "Cambio aprobado" : "Cambio rechazado";
  }
  if (type === "admin" && data?.type === "go_panic") return "Alerta de pánico";
  if (type === "admin") return "Notificación del administrador";
  return "Notificación";
}

function getDescription(type: string, data?: Record<string, unknown>): string | null {
  const d = data ?? {};
  const storeBody = getStoreNotificationBody(type, d);
  if (storeBody) return storeBody;
  if (type === "account_change_request_approved" || type === "account_change_request_rejected") {
    const msg = d.message ?? (d.data as Record<string, unknown> | undefined)?.message;
    if (typeof msg === "string" && msg.trim()) return msg.trim();
    return type === "account_change_request_approved"
      ? "Abre Configuración para ver los cambios."
      : "Revisa el detalle en Configuración.";
  }
  if (type === "admin" && d.type === "go_panic") {
    const nested = (d.data as Record<string, unknown> | undefined) ?? {};
    const det = typeof d.details === "string" ? d.details : typeof nested.details === "string" ? nested.details : "";
    const t = det.trim();
    return t.length > 0 ? (t.length > 200 ? `${t.slice(0, 200)}…` : t) : "Toca la fila para abrir el detalle completo.";
  }
  const msg = d.message ?? (d.data as Record<string, unknown> | undefined)?.message;
  return typeof msg === "string" && msg.trim() ? msg.trim() : null;
}

function GoPanicDetailView({ packet }: { packet: Record<string, unknown> | null | undefined }) {
  const nested = (packet?.data as Record<string, unknown> | undefined) ?? {};
  const details =
    typeof nested.details === "string"
      ? nested.details
      : typeof packet?.details === "string"
        ? (packet.details as string)
        : "";
  const rideId = nested.rideId ?? packet?.rideId;
  const moduleLabel = nested.module ?? packet?.module;
  const pressedBy = nested.pressedBy ?? packet?.pressedBy;
  const rows: { label: string; value: string }[] = [];
  if (rideId != null && String(rideId).trim()) rows.push({ label: "ID viaje", value: String(rideId) });
  if (moduleLabel != null && String(moduleLabel).trim()) rows.push({ label: "Servicio", value: String(moduleLabel) });
  if (pressedBy === "rider" || pressedBy === "driver") {
    rows.push({ label: "Quién pulsó", value: pressedBy === "rider" ? "Cliente" : "Conductor" });
  }
  return (
    <div className="space-y-4">
      {rows.length > 0 ? (
        <dl className="grid gap-2 text-sm">
          {rows.map((r) => (
            <div
              key={r.label}
              className="grid grid-cols-[minmax(0,8.5rem)_1fr] gap-2 border-b border-border/60 pb-2 last:border-0"
            >
              <dt className="text-muted-foreground">{r.label}</dt>
              <dd className="min-w-0 break-words font-medium text-foreground">{r.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {details.trim() ? (
        <pre className="max-h-[min(52vh,420px)] overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/40 p-4 text-sm leading-relaxed text-foreground">
          {details}
        </pre>
      ) : (
        <p className="text-sm text-muted-foreground">No hay texto de detalle en esta alerta.</p>
      )}
    </div>
  );
}

export default function Notifications() {
  const { isAuthenticated } = useAuth();
  const { notifications, markNotificationAsRead, clearNotifications } = useSocket();
  const [, setLocation] = useLocation();

  const nav = useMemo(() => {
    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    const returnToRaw = params.get("returnTo");
    const returnTo = typeof returnToRaw === "string" && returnToRaw.trim().startsWith("/") ? returnToRaw.trim() : null;
    return { backHref: returnTo ?? "/" };
  }, [location]);

  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);

  const search = useSearch();
  const detailId = useMemo(() => {
    const raw = (search ?? "").replace(/^\?/, "");
    return new URLSearchParams(raw).get("detail");
  }, [search]);

  const detailNotification = useMemo(
    () => (detailId ? notifications.find((n) => String(n.id) === detailId) : undefined),
    [detailId, notifications],
  );

  const closeDetailModal = () => {
    navigate("/notifications", { replace: true });
  };

  const filtered = useMemo(() => {
    const base = notifications;
    return unreadOnly ? base.filter((n) => !n.read) : base;
  }, [notifications, unreadOnly]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), totalPages);

  const pageNotifications = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, currentPage]);

  useEffect(() => {
    if (!notifications.length) return;
    if (notifications.some((n) => !n.read)) {
      clearNotifications();
    }
  }, [notifications, clearNotifications]);

  const handleOpenNotification = (notification: { id: string; type: string; data?: Record<string, unknown> }) => {
    markNotificationAsRead(notification.id);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    }
    setLocation(getStoreNotificationPath(notification));
  };

  if (!isAuthenticated) {
    return (
      <div className="container max-w-4xl py-12 px-4">
        <Card className="border-border bg-card">
          <CardContent className="pt-6">
            <p className="text-muted-foreground text-center mb-4">
              Debes iniciar sesión para ver el historial de notificaciones.
            </p>
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
          <Link href={nav.backHref}>
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Link>
        </Button>
        <Button
          variant={unreadOnly ? "default" : "outline"}
          size="sm"
          onClick={() => {
            setUnreadOnly((v) => !v);
            setPage(1);
          }}
        >
          {unreadOnly ? "Solo no leídas" : "Mostrar no leídas"}
        </Button>
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
              {pageNotifications.map((notification) => {
                const data = (notification.data ?? {}) as Record<string, unknown>;
                const title = getTitle(notification.type, data);
                const detail = getDescription(notification.type, data);

                return (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={() => handleOpenNotification(notification)}
                    className={getNotificationCardClassName({ read: notification.read })}
                  >
                    <div className="flex items-start gap-2">
                      {getIcon(notification.type, data)}
                      <div className="flex-1 min-w-0">
                        <p className={getNotificationTitleClassName()}>{title}</p>
                        {detail ? <p className="text-xs text-muted-foreground mt-0.5">{detail}</p> : null}
                        <p className="text-xs text-muted-foreground mt-1">
                          {notification.timestamp instanceof Date
                            ? notification.timestamp.toLocaleString()
                            : new Date(notification.timestamp).toLocaleString()}
                        </p>
                      </div>
                      {!notification.read ? (
                        <Badge variant="default" className="h-2 w-2 p-0 rounded-full" />
                      ) : null}
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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              Siguiente
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={detailId != null} onOpenChange={(open) => { if (!open) closeDetailModal(); }}>
        <DialogContent className="max-w-[min(100vw-2rem,32rem)] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {detailNotification?.data?.type === "go_panic" ? "Alerta de pánico" : "Detalle de la notificación"}
            </DialogTitle>
            <DialogDescription className="sr-only">Contenido de la alerta seleccionada.</DialogDescription>
          </DialogHeader>
          {detailNotification ? (
            detailNotification.data?.type === "go_panic" ? (
              <GoPanicDetailView packet={detailNotification.data as Record<string, unknown>} />
            ) : (
              <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed">
                {JSON.stringify(detailNotification.data, null, 2)}
              </pre>
            )
          ) : detailId ? (
            <p className="text-sm text-muted-foreground">
              No encontramos esta notificación en la sesión actual.
            </p>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
