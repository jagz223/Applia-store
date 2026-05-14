import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Bell, Check, ChevronRight, Info, MessageSquare, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSocket } from "@/hooks/use-socket";
import { useGoNotifications } from "@/contexts/GoNotificationsContext";

function getNotificationHref(notification: { id?: string; type: string; data?: any }): string | null {
  const data = notification.data ?? {};
  const url = data?.url ?? data?.data?.url;
  if (typeof url === "string" && url.trim()) return url.startsWith("/") ? url : `/${url}`;

  if (notification.type === "admin" && data?.type === "go_panic" && notification.id) {
    return `/notifications?detail=${encodeURIComponent(String(notification.id))}`;
  }

  const subtype = data?.type ?? data?.data?.type;
  if (typeof subtype === "string" && subtype.startsWith("cargo_")) return "/go/taxi";

  if (notification.type === "message") {
    const convId = data?.conversationId ?? data?.data?.conversationId;
    if (convId != null) return `/chat?conversation=${encodeURIComponent(String(convId))}`;
    return "/chat";
  }

  // Para cualquier otro evento sin URL explícita, no forzamos navegación fuera de Go.
  return null;
}

function getTitle(notification: { type: string; data?: any }): string {
  const data = notification.data ?? {};
  if (notification.type === "message") return "Nuevo mensaje";
  if (notification.type === "admin" && data?.type === "go_panic") return "Pánico Genfeb Go";
  if (notification.type === "admin") return "Aviso del administrador";
  if (notification.type === "booking") return "Actualización de reserva";
  if (notification.type === "verification_result") return "Resultado de verificación";
  if (notification.type === "verification_welcome") return "Verificación";
  const t = data?.title ?? data?.data?.title;
  if (typeof t === "string" && t.trim()) return t.trim();
  return "Notificación";
}

function getDescription(notification: { type: string; data?: any }): string | null {
  const data = notification.data ?? {};
  if (data?.type === "go_panic") {
    const nested = data?.data ?? {};
    const det = typeof data?.details === "string" ? data.details : typeof nested.details === "string" ? nested.details : "";
    const t = det.trim();
    return t.length > 0 ? (t.length > 120 ? `${t.slice(0, 120)}…` : t) : "Toca para ver el detalle completo.";
  }
  const body = data?.body ?? data?.data?.body;
  if (typeof body === "string" && body.trim()) return body.trim();
  const msg = data?.message ?? data?.data?.message;
  if (typeof msg === "string" && msg.trim()) return msg.trim();
  return null;
}

export function GoNotificationsDrawer() {
  const { isOpen, closeNotifications } = useGoNotifications();
  const { notifications, markNotificationAsRead, clearNotifications } = useSocket();
  const [, setLocation] = useLocation();
  const [unreadOnly, setUnreadOnly] = useState(false);

  const list = useMemo(
    () => (unreadOnly ? notifications.filter((n) => !n.read) : notifications),
    [notifications, unreadOnly]
  );

  return (
    <Sheet open={isOpen} onOpenChange={(open) => (!open ? closeNotifications() : undefined)}>
      <SheetContent side="right" hideClose className="w-full p-0 sm:max-w-md">
        <div className="flex h-screen h-[100svh] flex-col">
          <SheetHeader className="border-b border-border px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <SheetTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-primary" aria-hidden />
                Avisos
              </SheetTitle>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant={unreadOnly ? "default" : "outline"}
                  size="sm"
                  onClick={() => setUnreadOnly((v) => !v)}
                >
                  {unreadOnly ? "Solo no leídas" : "No leídas"}
                </Button>
                <Button type="button" variant="ghost" size="icon" onClick={closeNotifications} aria-label="Cerrar">
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {list.length} aviso{list.length === 1 ? "" : "s"}
              </p>
              <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={clearNotifications}>
                Marcar todo leído
              </Button>
            </div>
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            {list.length === 0 ? (
              <div className="mx-auto mt-10 max-w-sm rounded-xl border border-dashed border-border bg-muted/25 px-4 py-6 text-center">
                <Info className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">No hay avisos para mostrar</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Cuando recibas novedades (mensajes, viajes, reservas), las verás aquí.
                </p>
              </div>
            ) : (
              <ul className="space-y-2 pb-4">
                {list.map((n) => {
                  const href = getNotificationHref(n as any);
                  const title = getTitle(n as any);
                  const detail = getDescription(n as any);
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        className={cn(
                          "w-full rounded-xl border border-border bg-card px-3 py-3 text-left shadow-sm transition-colors",
                          "hover:bg-muted/40 active:bg-muted/60"
                        )}
                        onClick={() => {
                          markNotificationAsRead(String(n.id));
                          if (href) {
                            closeNotifications();
                            setLocation(href);
                          }
                        }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              {!n.read ? (
                                <span className="inline-flex h-2 w-2 rounded-full bg-amber-500" aria-hidden />
                              ) : (
                                <Check className="h-4 w-4 text-muted-foreground" aria-hidden />
                              )}
                              <p className="truncate font-semibold text-foreground">{title}</p>
                            </div>
                            {detail ? (
                              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{detail}</p>
                            ) : null}
                            {n.type === "message" ? (
                              <p className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-primary">
                                <MessageSquare className="h-3.5 w-3.5" />
                                Abrir chat
                              </p>
                            ) : null}
                          </div>
                          {href ? <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" /> : null}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

