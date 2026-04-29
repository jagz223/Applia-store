import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Banknote, Car, History, Package, Store, MessageSquare, Settings, Bell, TrendingUp, Wallet } from "lucide-react";
import { useGoChat } from "@/contexts/GoChatContext";
import { useGoDriverUi } from "@/contexts/GoDriverUiContext";
import { useCategoryVisibility, useWallet, useWalletTransfers } from "@/hooks/use-mango-data";
import { effectiveHiddenCategorySlugs } from "@shared/default-categories";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DriverEarningsPanel } from "@/components/go/DriverEarningsPanel";
import { loadRiderTripLog } from "@/lib/cargo-rider-trip-log";
import { useSocket } from "@/hooks/use-socket";
import { useGoNotifications } from "@/contexts/GoNotificationsContext";
import { loadGoDriverActiveRideId } from "@/lib/cargo-driver-storage";
import { loadGoRiderActiveRideId } from "@/lib/cargo-rider-storage";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { getTransferTypeLabel } from "@/lib/invoice-pdf";

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
  const { isAuthenticated } = useAuth();
  const { openChat, chatBadge } = useGoChat();
  const { openNotifications } = useGoNotifications();
  const goDriverUi = useGoDriverUi();
  const { notifications } = useSocket();
  const { toast } = useToast();
  const [riderHistoryOpen, setRiderHistoryOpen] = useState(false);
  const [riderWalletOpen, setRiderWalletOpen] = useState(false);
  const [driverEarningsOpen, setDriverEarningsOpen] = useState(false);
  const unreadNotif = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

  /** En escritorio: barra compacta centrada tipo “dock”, sin estirar 6 ítems a todo el ancho. */
  const [desktopNav, setDesktopNav] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(min-width: 768px)").matches : false
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const fn = () => setDesktopNav(mq.matches);
    fn();
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);
  const { data: visibility } = useCategoryVisibility();
  const hiddenSlugs = useMemo(() => new Set(effectiveHiddenCategorySlugs(visibility?.hiddenSlugs)), [visibility]);
  const showShop = !hiddenSlugs.has("marketplace");
  const showPack = !hiddenSlugs.has("delivery");
  const isCargoDriverView = location === "/go/cargo/driver" || location.startsWith("/go/cargo/driver/");
  const isPackDriverView = location === "/go/pack/driver" || location.startsWith("/go/pack/driver/");
  const isDriverView = isCargoDriverView || isPackDriverView;
  const isRiderCargoView = location === "/go/cargo" || location.startsWith("/go/cargo/");
  const isRiderPackView = location === "/go/pack" || location.startsWith("/go/pack/");
  const isRiderGoView = isRiderCargoView || isRiderPackView;
  const cargoHref = isDriverView ? "/go/cargo/driver" : "/go/cargo";
  const packHref = isDriverView ? "/go/pack/driver" : "/go/pack";
  const configHref = isCargoDriverView ? "/go/cargo/driver/settings" : isPackDriverView ? "/go/pack/driver/settings" : "/go/cargo";

  const [activeDriverService, setActiveDriverService] = useState<null | { module: "cargo" | "pack"; rideId: string }>(null);
  useEffect(() => {
    if (!isDriverView) {
      setActiveDriverService(null);
      return;
    }
    const read = () => {
      const cargo = loadGoDriverActiveRideId("cargo");
      const pack = loadGoDriverActiveRideId("pack");
      const next = cargo ? { module: "cargo" as const, rideId: cargo } : pack ? { module: "pack" as const, rideId: pack } : null;
      setActiveDriverService((cur) => (cur?.module === next?.module && cur?.rideId === next?.rideId ? cur : next));
    };
    read();
    const t = window.setInterval(read, 700);
    return () => window.clearInterval(t);
  }, [isDriverView]);

  const [activeRiderService, setActiveRiderService] = useState<null | { module: "cargo" | "pack"; rideId: string }>(null);
  useEffect(() => {
    if (isDriverView || !isRiderGoView) {
      setActiveRiderService(null);
      return;
    }
    const read = () => {
      const cargo = loadGoRiderActiveRideId("cargo");
      const pack = loadGoRiderActiveRideId("pack");
      const next = cargo ? { module: "cargo" as const, rideId: cargo } : pack ? { module: "pack" as const, rideId: pack } : null;
      setActiveRiderService((cur) => (cur?.module === next?.module && cur?.rideId === next?.rideId ? cur : next));
    };
    read();
    const t = window.setInterval(read, 700);
    return () => window.clearInterval(t);
  }, [isDriverView, isRiderGoView]);

  const { data: walletData } = useWallet({ enabled: riderWalletOpen && isRiderGoView && isAuthenticated });
  const walletBalance = typeof walletData?.wallet === "number" ? walletData.wallet : 0;
  const { data: walletTransfersData, isLoading: walletTransfersLoading } = useWalletTransfers({
    page: 1,
    limit: 12,
    enabled: riderWalletOpen && isRiderGoView && isAuthenticated,
  });

  const tabs: Tab[] = useMemo(
    () =>
      [
        { href: cargoHref, label: "Car Go", icon: <Car className="h-5 w-5" aria-hidden /> },
        showPack ? { href: packHref, label: "Pack Go", icon: <Package className="h-5 w-5" aria-hidden /> } : null,
        showShop ? { href: "/go/shop", label: "Shop Go", icon: <Store className="h-5 w-5" aria-hidden /> } : null,
        !isDriverView && isRiderGoView
          ? {
              href: "__go_rider_history__",
              label: "Historial",
              icon: <History className="h-5 w-5" aria-hidden />,
              onClick: () => setRiderHistoryOpen(true),
            }
          : null,
        !isDriverView && isRiderGoView
          ? {
              href: "__go_rider_wallet__",
              label: "Saldo",
              icon: <Wallet className="h-5 w-5" aria-hidden />,
              onClick: () => {
                if (!isAuthenticated) {
                  toast({ title: "Inicia sesión", description: "Debes iniciar sesión para ver tu Saldo GenFeb.", variant: "destructive" });
                  return;
                }
                setRiderWalletOpen(true);
              },
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
    [
      openChat,
      openNotifications,
      location,
      cargoHref,
      packHref,
      configHref,
      isDriverView,
      isCargoDriverView,
      isPackDriverView,
      showShop,
      showPack,
      goDriverUi,
      isRiderGoView,
      isAuthenticated,
      toast,
      setLocation,
    ]
  );

  return (
    <>
      <div
        className={cn(
          "sticky bottom-0 z-50 shrink-0",
          desktopNav &&
            "pointer-events-none md:bg-gradient-to-t md:from-background/85 md:to-transparent md:pb-5 md:pt-4"
        )}
      >
        <nav
          className={cn(
            "border-t border-border/90 bg-background/98 shadow-[0_-6px_28px_-4px_rgba(0,0,0,0.12)] backdrop-blur-md supports-[backdrop-filter]:bg-background/92 dark:shadow-[0_-6px_32px_-4px_rgba(0,0,0,0.45)]",
            desktopNav &&
              "pointer-events-auto md:mx-auto md:max-h-none md:max-w-[min(760px,calc(100vw-4rem))] md:rounded-2xl md:border md:border-border/65 md:bg-background/95 md:shadow-2xl dark:md:border-white/15"
          )}
        >
        <div
          className={cn(
            "gap-1 px-2 py-2",
            desktopNav
              ? "flex flex-nowrap justify-center gap-1 overflow-x-auto overscroll-x-contain px-4 py-2.5 [scrollbar-width:thin]"
              : "grid"
          )}
          style={!desktopNav ? { gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` } : undefined}
        >
          {tabs.map((t) => {
            const active = tabIsActive(location, t.href, !!t.onClick);
            const isChatTab = t.href === "__go_chat__";
            const isNotifTab = t.href.startsWith("/notifications") || t.href === "__go_notifications__";
            const isGoDriverTab = isDriverView && (t.href === "/go/cargo/driver" || t.href === "/go/pack/driver");
            const isGoRiderTab = !isDriverView && (t.href === "/go/cargo" || t.href === "/go/pack");
            const blockedByService =
              isGoDriverTab &&
              !!activeDriverService &&
              ((activeDriverService.module === "cargo" && t.href === "/go/pack/driver") ||
                (activeDriverService.module === "pack" && t.href === "/go/cargo/driver"));
            const blockedByRiderService =
              isGoRiderTab &&
              !!activeRiderService &&
              ((activeRiderService.module === "cargo" && t.href === "/go/pack") ||
                (activeRiderService.module === "pack" && t.href === "/go/cargo"));
            return (
              <Button
                key={t.label}
                type="button"
                variant="ghost"
                disabled={blockedByService || blockedByRiderService}
                className={cn(
                  "touch-manipulation flex-col gap-0.5 rounded-xl border-0 shadow-none transition-[transform,background-color,color,box-shadow] duration-150 ease-out",
                  desktopNav
                    ? "h-auto min-h-[3.35rem] w-[4.75rem] max-w-[5.5rem] shrink-0 px-2 py-2"
                    : "h-12 w-full",
                  "active:scale-[0.94] active:bg-muted/95",
                  (blockedByService || blockedByRiderService) && "opacity-55 pointer-events-auto active:scale-100",
                  active
                    ? "bg-primary/14 font-semibold text-primary shadow-inner ring-1 ring-primary/25 [&_svg]:text-primary"
                    : "text-foreground/90 [&_svg]:text-foreground/85 hover:bg-muted/80 hover:text-foreground"
                )}
                onClick={() => {
                  if (t.onClick) return t.onClick();
                  if (blockedByService) {
                    toast({
                      title: "Servicio en curso",
                      description:
                        activeDriverService?.module === "cargo"
                          ? "Tienes un servicio activo en Car Go. Finalízalo o cancélalo para entrar a Pack Go."
                          : "Tienes un servicio activo en Pack Go. Finalízalo o cancélalo para entrar a Car Go.",
                      variant: "destructive",
                    });
                    return;
                  }
                  if (blockedByRiderService) {
                    toast({
                      title: "Servicio en curso",
                      description:
                        activeRiderService?.module === "cargo"
                          ? "Tienes un servicio activo en Car Go. Finalízalo o cancélalo para entrar a Pack Go."
                          : "Tienes un servicio activo en Pack Go. Finalízalo o cancélalo para entrar a Car Go.",
                      variant: "destructive",
                    });
                    return;
                  }
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
                <span className="text-[11px] leading-tight">{t.label}</span>
              </Button>
            );
          })}
        </div>
      </nav>
      </div>

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
            <DriverEarningsPanel open={driverEarningsOpen} configHref={configHref} />
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={riderHistoryOpen} onOpenChange={setRiderHistoryOpen}>
        <SheetContent side="bottom" className="max-h-[min(85dvh,560px)] overflow-y-auto rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Historial (Car Go · Pack Go)</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-3 pb-6">
            {loadRiderTripLog().length === 0 ? (
              <p className="text-sm text-muted-foreground leading-relaxed">
                Aún no hay servicios registrados. Cuando completes servicios con Car Go o Pack Go, aquí verás el monto, duración y el conductor.
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
                      <span>
                        Servicio:{" "}
                        <span className="font-medium text-foreground">{t.goSlug === "pack" ? "Pack Go" : "Car Go"}</span>
                      </span>
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

      <Sheet open={riderWalletOpen} onOpenChange={setRiderWalletOpen}>
        <SheetContent side="bottom" className="max-h-[min(92dvh,720px)] overflow-y-auto rounded-t-2xl">
          <SheetHeader className="text-left space-y-1.5">
            <SheetTitle>Saldo GenFeb</SheetTitle>
            <SheetDescription>Movimientos, comprobantes y saldo GenFeb en un solo lugar.</SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-3 pb-6 text-sm">
            <div className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
              <div>
                <p className="text-xs text-muted-foreground">Saldo disponible</p>
                <p className="mt-0.5 text-lg font-bold tabular-nums text-foreground">
                  {new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(walletBalance)}
                </p>
              </div>
              <Button
                type="button"
                className="shrink-0 gap-2"
                onClick={() => {
                  setRiderWalletOpen(false);
                  setLocation(`/recharge?return=${encodeURIComponent(location)}`);
                }}
              >
                <Banknote className="h-4 w-4" aria-hidden />
                Añadir saldo
              </Button>
            </div>

            <div className="rounded-xl border border-border bg-card shadow-sm">
              <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                <p className="font-semibold text-foreground">Movimientos</p>
                <Button asChild variant="ghost" size="sm" className="h-8">
                  <a
                    href="/dashboard"
                    onClick={(e) => {
                      e.preventDefault();
                      setRiderWalletOpen(false);
                      setLocation("/dashboard");
                    }}
                  >
                    Ver todo
                  </a>
                </Button>
              </div>
              <div className="p-4">
                {walletTransfersLoading ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground">
                    <span className="inline-flex items-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
                      Cargando…
                    </span>
                  </div>
                ) : (walletTransfersData?.transfers ?? []).length === 0 ? (
                  <p className="py-8 text-center text-muted-foreground">Aún no hay movimientos.</p>
                ) : (
                  <ul className="space-y-2">
                    {(walletTransfersData?.transfers ?? []).slice(0, 12).map((t: any, idx: number) => {
                      const type = t?.transferType as "service_payment" | "recharge" | "withdrawal" | "payment" | undefined;
                      const status = t?.status as "pending_approval" | "completed" | "rejected" | undefined;
                      const label = type ? getTransferTypeLabel(type) : "Movimiento";
                      const amount = typeof t?.amount === "number" ? t.amount : Number(t?.amount) || 0;
                      const isPending = status === "pending_approval";
                      const amountColor =
                        isPending
                          ? "text-muted-foreground"
                          : type === "payment" || type === "withdrawal"
                            ? "text-red-600"
                            : "text-emerald-600";
                      return (
                        <li key={String(t?.id ?? idx)} className="flex items-start justify-between gap-3 rounded-lg border border-border bg-muted/10 px-3 py-2">
                          <div className="min-w-0">
                            <p className="truncate text-[12px] font-medium text-foreground">{label}</p>
                            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                              {isPending ? "Pendiente" : status === "rejected" ? "Rechazado" : "Completado"}
                              {t?.description ? ` · ${String(t.description)}` : ""}
                            </p>
                          </div>
                          <p className={cn("shrink-0 font-semibold tabular-nums", amountColor)}>
                            {new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(amount)}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

