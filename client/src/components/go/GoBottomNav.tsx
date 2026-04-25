import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Car, History, Package, Store, MessageSquare, Settings, Bell, TrendingUp } from "lucide-react";
import { useGoChat } from "@/contexts/GoChatContext";
import { useGoDriverUi } from "@/contexts/GoDriverUiContext";
import { useCategoryVisibility } from "@/hooks/use-mango-data";
import { effectiveHiddenCategorySlugs } from "@shared/default-categories";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DriverEarningsPanel } from "@/components/go/DriverEarningsPanel";
import { loadRiderTripLog } from "@/lib/cargo-rider-trip-log";
import { useSocket } from "@/hooks/use-socket";
import { useGoNotifications } from "@/contexts/GoNotificationsContext";

type Tab = {
  href: string;
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
};

function tabIsActive(location: string, href: string, hasAction?: boolean): boolean {
  if (hasAction) return false;
  if (href.startsWith("__")) return false;
  return location === href || (href.length > 1 && location.startsWith(`${href}/`));
}

export function GoBottomNav() {
  const [location, setLocation] = useLocation();
  const { openChat, chatBadge } = useGoChat();
  const { openNotifications } = useGoNotifications();
  const goDriverUi = useGoDriverUi();
  const { notifications } = useSocket();
  const [riderHistoryOpen, setRiderHistoryOpen] = useState(false);
  const [driverEarningsOpen, setDriverEarningsOpen] = useState(false);
  const unreadNotif = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);
  const { data: visibility } = useCategoryVisibility();
  const hiddenSlugs = useMemo(() => new Set(effectiveHiddenCategorySlugs(visibility?.hiddenSlugs)), [visibility]);
  const showShop = !hiddenSlugs.has("marketplace");
  const showPack = !hiddenSlugs.has("delivery");
  const isDriverView = location === "/go/cargo/driver" || location.startsWith("/go/cargo/driver/");
  const isRiderCargoView = location === "/go/cargo" || location.startsWith("/go/cargo/");
  const cargoHref = isDriverView ? "/go/cargo/driver" : "/go/cargo";
  const configHref = isDriverView ? "/go/cargo/driver/settings" : "/go/cargo";

  const tabs: Tab[] = useMemo(
    () =>
      [
        { href: cargoHref, label: "Car Go", icon: <Car className="h-5 w-5" aria-hidden /> },
        !isDriverView && isRiderCargoView
          ? {
              href: "__go_rider_history__",
              label: "Historial",
              icon: <History className="h-5 w-5" aria-hidden />,
              onClick: () => setRiderHistoryOpen(true),
            }
          : null,
        isDriverView && goDriverUi
          ? {
              href: "__go_driver_history__",
              label: "Historial",
              icon: <History className="h-5 w-5" aria-hidden />,
              onClick: () => goDriverUi.openHistory(),
            }
          : null,
        isDriverView
          ? {
              href: "__go_driver_earnings__",
              label: "Ingresos",
              icon: <TrendingUp className="h-5 w-5" aria-hidden />,
              onClick: () => setDriverEarningsOpen(true),
            }
          : null,
        showShop ? { href: "/go/shop", label: "Shop Go", icon: <Store className="h-5 w-5" aria-hidden /> } : null,
        showPack ? { href: "/go/pack", label: "Pack Go", icon: <Package className="h-5 w-5" aria-hidden /> } : null,
        /** En conductor: acceso a ajustes. En cliente /go/cargo no mostramos el tab redundante "Mapa". */
        isDriverView ? { href: configHref, label: "Config", icon: <Settings className="h-5 w-5" aria-hidden /> } : null,
        {
          href: "__go_notifications__",
          label: "Avisos",
          icon: <Bell className="h-5 w-5" aria-hidden />,
          onClick: openNotifications,
        },
        { href: "__go_chat__", label: "Chat", icon: <MessageSquare className="h-5 w-5" aria-hidden />, onClick: openChat },
      ].filter(Boolean) as Tab[],
    [openChat, openNotifications, location, cargoHref, configHref, isDriverView, showShop, showPack, goDriverUi, isRiderCargoView]
  );

  return (
    <>
      <nav className="sticky bottom-0 z-50 border-t border-border/90 bg-background/98 shadow-[0_-6px_28px_-4px_rgba(0,0,0,0.12)] backdrop-blur-md supports-[backdrop-filter]:bg-background/92 dark:shadow-[0_-6px_32px_-4px_rgba(0,0,0,0.45)]">
        <div className="grid gap-1 px-2 py-2" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
          {tabs.map((t) => {
            const active = tabIsActive(location, t.href, !!t.onClick);
            const isChatTab = t.href === "__go_chat__";
            const isNotifTab = t.href.startsWith("/notifications");
            return (
              <Button
                key={t.label}
                type="button"
                variant="ghost"
                className={cn(
                  "h-12 w-full touch-manipulation flex-col gap-0.5 rounded-xl border-0 shadow-none transition-[transform,background-color,color,box-shadow] duration-150 ease-out",
                  "active:scale-[0.94] active:bg-muted/95",
                  active
                    ? "bg-primary/14 font-semibold text-primary shadow-inner ring-1 ring-primary/25 [&_svg]:text-primary"
                    : "text-foreground/90 [&_svg]:text-foreground/85 hover:bg-muted/80 hover:text-foreground"
                )}
                onClick={() => {
                  if (t.onClick) return t.onClick();
                  setLocation(t.href);
                }}
              >
                <span className="relative">
                  {t.icon}
                {isNotifTab && unreadNotif > 0 ? (
                  <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold leading-none text-black">
                    {unreadNotif > 9 ? "9+" : unreadNotif}
                  </span>
                ) : null}
                  {isChatTab && chatBadge > 0 ? (
                    <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground">
                      {chatBadge}
                    </span>
                  ) : null}
                </span>
                <span className="text-[11px] leading-none">{t.label}</span>
              </Button>
            );
          })}
        </div>
      </nav>

      <Sheet open={driverEarningsOpen} onOpenChange={setDriverEarningsOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[min(92dvh,720px)] overflow-y-auto overflow-x-hidden rounded-t-2xl p-4 sm:max-w-lg sm:mx-auto"
        >
          <SheetHeader className="text-left space-y-1.5 sm:pr-6">
            <SheetTitle className="font-display text-lg">Ingresos — Car Go</SheetTitle>
            <SheetDescription>
              Resumen al estilo panel de asociado: cartera, límite y actividad por día.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-3">
            <DriverEarningsPanel open={driverEarningsOpen} />
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={riderHistoryOpen} onOpenChange={setRiderHistoryOpen}>
        <SheetContent side="bottom" className="max-h-[min(85dvh,560px)] overflow-y-auto rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Historial (Car Go)</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-3 pb-6">
            {loadRiderTripLog().length === 0 ? (
              <p className="text-sm text-muted-foreground leading-relaxed">
                Aún no hay viajes registrados. Cuando completes carreras con Car Go, aquí verás el monto, duración y el conductor.
              </p>
            ) : (
              <ul className="space-y-3">
                {loadRiderTripLog().map((t) => (
                  <li key={t.id} className="rounded-xl border border-border bg-card px-4 py-3 text-sm shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium text-foreground">{new Date(t.endedAt).toLocaleString("es-EC")}</span>
                      <span className="tabular-nums font-semibold text-foreground">
                        {new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(t.amountUsd)}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground text-xs">
                      <span>Conductor: <span className="font-medium text-foreground">{t.driverName}</span></span>
                      <span>Duración: {t.durationMin} min</span>
                      <span>
                        Pago:{" "}
                        <span className="font-medium text-foreground">
                          {t.payment === "genfeb" ? "Saldo GenFeb" : t.payment === "cash" ? "Efectivo" : "Transferencia"}
                        </span>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

