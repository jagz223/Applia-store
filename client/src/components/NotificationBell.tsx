import { useState } from "react";
import { Bell, MessageSquare, Calendar, Shield, Trash2, BellRing, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { useSocket } from "@/hooks/use-socket";
import { useLocation } from "wouter";
import { usePushNotifications } from "@/hooks/use-push-notifications";

/** Devuelve la ruta a la que debe ir el usuario al hacer clic en la notificación. */
function getNotificationPath(notification: { type: string; data?: any }): string {
  const data = notification.data ?? {};
  switch (notification.type) {
    case "message":
      const convId = data.conversationId;
      return convId != null ? `/chat?conversation=${encodeURIComponent(convId)}` : "/chat";
    case "booking":
      if (data.type === "new_booking") {
        return "/professional-dashboard?tab=bookings";
      }
      return "/bookings";
    case "admin":
      if (data.type === "recharge_pending") {
        const transferId = data.data?.transferId ?? data.transferId;
        const q = new URLSearchParams({ tab: "recargas" });
        if (transferId != null) q.set("highlight", String(transferId));
        return `/admin?${q.toString()}`;
      }
      return "/dashboard";
    case "recharge_completed":
    case "recharge_rejected":
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
    // Si es recarga pendiente, notificar al panel Admin para que abra Recargas y resalte la fila
    const data = notification.data ?? {};
    if (data.type === "recharge_pending") {
      const transferId = data.data?.transferId ?? data.transferId;
      window.dispatchEvent(
        new CustomEvent("admin-open-recargas", { detail: { transferId: transferId != null ? Number(transferId) : null } })
      );
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
      case "recharge_completed":
        return <Bell className="h-4 w-4 text-green-500" />;
      case "recharge_rejected":
        return <Bell className="h-4 w-4 text-red-500" />;
      default:
        return <Bell className="h-4 w-4 text-gray-500" />;
    }
  };

  const getTitle = (type: string, data?: { type?: string }) => {
    if (type === "booking" && data?.type === "new_booking") return "Nueva reserva";
    if (type === "admin" && data?.type === "recharge_pending") return "Nueva solicitud de recarga";
    if (type === "recharge_completed") return "Recarga aprobada";
    if (type === "recharge_rejected") return "Recarga rechazada";
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
