import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Car, History, Menu, Package, MessageSquare, Settings, Bell, TrendingUp, Tags, Ticket } from "lucide-react";
import { useGoChat } from "@/contexts/GoChatContext";
import { useGoDriverUi } from "@/contexts/GoDriverUiContext";
import { useCategories, useCategoryVisibility, useCurrentProvider } from "@/hooks/use-mango-data";
import { canAccessPromocionesPanel } from "@/lib/auth-utils";
import { isGoVehicleProvider } from "@shared/provider-car-go";
import { effectiveHiddenCategorySlugs } from "@shared/default-categories";
import { mobilityHistorySheetTitle, mobilityServiceLabel } from "@shared/mobility-ui-labels";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DriverEarningsPanel } from "@/components/go/DriverEarningsPanel";
import { fetchMobilityRideHistoryForUser } from "@/lib/mobility-ride-history-api";
import { historyToRiderTripLog } from "@/lib/mobility-ride-history-mappers";
import { useSocket } from "@/hooks/use-socket";
import { useGoNotifications } from "@/contexts/GoNotificationsContext";
import { loadGoDriverActiveRideId } from "@/lib/cargo-driver-storage";
import {
  GO_DRIVER_SUBSCRIPTION_INACTIVE_NEGOTIATION_HINT,
  isGoDriverSubscriptionActive,
} from "@shared/go-driver-subscription";
import { loadGoRiderActiveRideId } from "@/lib/cargo-rider-storage";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { QuickSettingsPanel } from "@/components/settings/QuickSettingsPanel";
import { GO_COMPACT_MAX_WIDTH_PX, goViewportBottomNavWrapperClass } from "@/lib/go-viewport-layout";

type Tab = {
  href: string;
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
  ariaLabel?: string;
  /** Deshabilitar ítem (p. ej. regateo sin perfil verificado). */
  disabled?: boolean;
  nativeTitle?: string;
};

function formatUsd(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return `$${v.toFixed(2)}`;
}

function tabIsActive(location: string, href: string, hasAction?: boolean): boolean {
  if (hasAction) return false;
  if (href.startsWith("__")) return false;
  return location === href || (href.length > 1 && location.startsWith(`${href}/`));
}

type GoBottomNavProps = {
  /** En vistas mapa móvil: anclar como último hijo flex del shell (sin sticky ni scroll). */
  pinToViewportBottom?: boolean;
};

export function GoBottomNav({ pinToViewportBottom = false }: GoBottomNavProps) {
  const [location, setLocation] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const { openChat, chatBadge } = useGoChat();
  const { openNotifications } = useGoNotifications();
  const goDriverUi = useGoDriverUi();
  const { notifications } = useSocket();
  const { toast } = useToast();
  const { data: categories = [] } = useCategories();
  const { data: currentProvider } = useCurrentProvider();
  const isAdmin = user?.role === "admin";
  const hasProvider =
    !!currentProvider || !!(user as { provider?: unknown } | null)?.provider;
  const showPromocionesNav =
    isAuthenticated &&
    canAccessPromocionesPanel(user, hasProvider, {
      isGoVehicleProvider:
        !!currentProvider && isGoVehicleProvider(currentProvider, categories),
    });
  const providerSubscriptionEndsAt = (
    currentProvider as { visibilitySubscriptionEndsAt?: string | null } | null | undefined
  )?.visibilitySubscriptionEndsAt;
  const hasActiveSubscription = isAdmin || isGoDriverSubscriptionActive(providerSubscriptionEndsAt);
  const canUseDriverNegotiationBoard =
    (isAdmin || currentProvider?.isVerified === true) && hasActiveSubscription;
  const [riderHistoryOpen, setRiderHistoryOpen] = useState(false);
  const [driverEarningsOpen, setDriverEarningsOpen] = useState(false);
  const [goQuickSettingsOpen, setGoQuickSettingsOpen] = useState(false);
  /** Conductor: menú tipo hamburguesa (Historial / Ingresos / Config) para no saturar la barra. */
  const [driverMoreMenuOpen, setDriverMoreMenuOpen] = useState(false);
  const unreadNotif = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

  // Preferir email para evitar colisiones si el backend cambia el tipo de id.
  const riderTripAccountId =
    (user as any)?.email != null ? String((user as any).email) : user?.id != null ? String(user.id) : null;
  const queryClient = useQueryClient();
  const { data: riderHistoryRows = [], isLoading: riderHistoryLoading } = useQuery({
    queryKey: ["mobility-ride-history", "rider", user?.id],
    queryFn: () => fetchMobilityRideHistoryForUser(50, "rider"),
    enabled: isAuthenticated && riderHistoryOpen,
  });
  const riderTripEntries = useMemo(
    () => riderHistoryRows.map(historyToRiderTripLog),
    [riderHistoryRows]
  );

  useEffect(() => {
    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: ["mobility-ride-history"] });
    };
    window.addEventListener("mobility-ride-history-changed", invalidate);
    return () => window.removeEventListener("mobility-ride-history-changed", invalidate);
  }, [queryClient]);

  /** En escritorio: barra compacta centrada tipo “dock”, sin estirar 6 ítems a todo el ancho. */
  const [desktopNav, setDesktopNav] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia(`(min-width: ${GO_COMPACT_MAX_WIDTH_PX + 1}px)`).matches
      : false
  );
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${GO_COMPACT_MAX_WIDTH_PX + 1}px)`);
    const fn = () => setDesktopNav(mq.matches);
    fn();
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);
  const { data: visibility } = useCategoryVisibility();
  const hiddenSlugs = useMemo(() => new Set(effectiveHiddenCategorySlugs(visibility?.hiddenSlugs)), [visibility]);
  const showPack = !hiddenSlugs.has("delivery");
  const isCargoDriverView =
    location === "/go/taxi/driver" ||
    location.startsWith("/go/taxi/driver/") ||
    location === "/go/cargo/driver" ||
    location.startsWith("/go/cargo/driver/");
  const isPackDriverView =
    location === "/go/delivery/driver" ||
    location.startsWith("/go/delivery/driver/") ||
    location === "/go/pack/driver" ||
    location.startsWith("/go/pack/driver/");
  const isDriverView = isCargoDriverView || isPackDriverView;
  /** Rutas de pasajero: no incluyen `/go/taxi/driver` ni `/go/delivery/driver` (antes quedaban mal clasificadas). */
  const isRiderCargoView =
    location === "/go/taxi" ||
    (location.startsWith("/go/taxi/") && !location.startsWith("/go/taxi/driver")) ||
    location === "/go/cargo" ||
    (location.startsWith("/go/cargo/") && !location.startsWith("/go/cargo/driver"));
  const isRiderPackView =
    location === "/go/delivery" ||
    (location.startsWith("/go/delivery/") && !location.startsWith("/go/delivery/driver")) ||
    location === "/go/pack" ||
    (location.startsWith("/go/pack/") && !location.startsWith("/go/pack/driver"));
  const isRiderGoView = isRiderCargoView || isRiderPackView;
  const cargoHref = isDriverView ? "/go/taxi/driver" : "/go/taxi";
  const packHref = isDriverView ? "/go/delivery/driver" : "/go/delivery";
  const configHref = isCargoDriverView ? "/go/taxi/driver/settings" : isPackDriverView ? "/go/delivery/driver/settings" : "/go/taxi";

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

  const tabs: Tab[] = useMemo(
    () =>
      [
        { href: cargoHref, label: "Taxi", icon: <Car className="h-5 w-5" aria-hidden /> },
        showPack ? { href: packHref, label: "Delivery", icon: <Package className="h-5 w-5" aria-hidden /> } : null,
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
              href: "__go_quick_settings__",
              label: "Config",
              icon: <Settings className="h-5 w-5" aria-hidden />,
              onClick: () => setGoQuickSettingsOpen(true),
            }
          : null,
        isDriverView && goDriverUi
          ? {
              href: "__go_driver_regateo__",
              label: "Regateo",
              icon: <Tags className="h-5 w-5" aria-hidden />,
              onClick: () => goDriverUi.openNegotiationBoard(),
              disabled: !canUseDriverNegotiationBoard || !!activeDriverService,
              nativeTitle: !canUseDriverNegotiationBoard
                ? currentProvider?.isVerified === true && !hasActiveSubscription
                  ? GO_DRIVER_SUBSCRIPTION_INACTIVE_NEGOTIATION_HINT
                  : "Verifica tu perfil profesional para ver el tablero de regateo (taxi y delivery)."
                : activeDriverService
                  ? "Tienes un servicio activo (taxi, delivery u oferta enlazada). Finalízalo o cancélalo antes de abrir Regateo."
                  : undefined,
            }
          : null,
        {
          href: "__go_notifications__",
          label: "Avisos",
          icon: <Bell className="h-5 w-5" aria-hidden />,
          onClick: openNotifications,
        },
        { href: "__go_chat__", label: "Chat", icon: <MessageSquare className="h-5 w-5" aria-hidden />, onClick: openChat },
        isDriverView && goDriverUi
          ? {
              href: "__go_driver_more__",
              label: "Más",
              icon: <Menu className="h-5 w-5" aria-hidden />,
              onClick: () => setDriverMoreMenuOpen(true),
              /** Para accesibilidad en el map de botones (no es Tab real). */
              ariaLabel: "Más: historial, ingresos y configuración",
            }
          : null,
      ].filter(Boolean) as Tab[],
    [
      openChat,
      openNotifications,
      location,
      cargoHref,
      packHref,
      configHref,
      isDriverView,
      user?.role,
      isCargoDriverView,
      isPackDriverView,
      showPack,
      goDriverUi,
      isRiderGoView,
      isAuthenticated,
      toast,
      setLocation,
      canUseDriverNegotiationBoard,
      hasActiveSubscription,
      currentProvider?.isVerified,
      providerSubscriptionEndsAt,
      activeDriverService,
    ]
  );

  return (
    <>
      <div className={goViewportBottomNavWrapperClass(pinToViewportBottom, desktopNav)}>
        <nav
          className={cn(
            !pinToViewportBottom || desktopNav
              ? "border-t border-border/90 bg-background/98 shadow-[0_-6px_28px_-4px_rgba(0,0,0,0.12)] backdrop-blur-md supports-[backdrop-filter]:bg-background/92 dark:shadow-[0_-6px_32px_-4px_rgba(0,0,0,0.45)]"
              : "bg-transparent shadow-none",
            desktopNav &&
              "pointer-events-auto lg:mx-auto lg:max-h-none lg:max-w-[min(760px,calc(100vw-4rem))] lg:rounded-2xl lg:border lg:border-border/65 lg:bg-background/95 lg:shadow-2xl dark:lg:border-white/15"
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
            const onSettings =
              t.href === configHref || (configHref.length > 1 && location.startsWith(`${configHref}/`));
            const active =
              tabIsActive(location, t.href, !!t.onClick) ||
              (t.href === "__go_driver_more__" &&
                isDriverView &&
                (driverMoreMenuOpen || driverEarningsOpen || onSettings));
            const isChatTab = t.href === "__go_chat__";
            const isNotifTab = t.href.startsWith("/notifications") || t.href === "__go_notifications__";
            const isGoDriverTab = isDriverView && (t.href === "/go/taxi/driver" || t.href === "/go/delivery/driver");
            const isGoRiderTab = !isDriverView && (t.href === "/go/taxi" || t.href === "/go/delivery");
            const highlightChat = isChatTab && (!!activeDriverService || !!activeRiderService);
            const blockedByService =
              isGoDriverTab &&
              !!activeDriverService &&
              ((activeDriverService.module === "cargo" && t.href === "/go/delivery/driver") ||
                (activeDriverService.module === "pack" && t.href === "/go/taxi/driver"));
            const blockedByRiderService =
              isGoRiderTab &&
              !!activeRiderService &&
              ((activeRiderService.module === "cargo" && t.href === "/go/delivery") ||
                (activeRiderService.module === "pack" && t.href === "/go/taxi"));
            const tabDisabled = !!t.disabled;
            const blockedByVerify = tabDisabled;
            return (
              <Button
                key={t.href}
                type="button"
                variant="ghost"
                aria-label={t.ariaLabel ?? t.label}
                title={t.nativeTitle}
                disabled={blockedByService || blockedByRiderService || tabDisabled}
                className={cn(
                  "touch-manipulation flex-col gap-0.5 rounded-xl border-0 shadow-none transition-[transform,background-color,color,box-shadow] duration-150 ease-out",
                  desktopNav
                    ? "h-auto min-h-[3.35rem] w-[4.75rem] max-w-[5.5rem] shrink-0 px-2 py-2"
                    : "h-12 w-full",
                  "active:scale-[0.94] active:bg-muted/95",
                  (blockedByService || blockedByRiderService || blockedByVerify) &&
                    "opacity-55 pointer-events-auto active:scale-100",
                  highlightChat && !active
                    ? "bg-primary text-primary-foreground shadow-lg ring-1 ring-primary/35 [&_svg]:text-primary-foreground"
                    : active
                    ? "bg-primary/14 font-semibold text-primary shadow-inner ring-1 ring-primary/25 [&_svg]:text-primary"
                    : "text-foreground/90 [&_svg]:text-foreground/85 hover:bg-muted/80 hover:text-foreground"
                )}
                onClick={() => {
                  if (t.onClick) {
                    t.onClick();
                    return;
                  }
                  if (blockedByService) {
                    toast({
                      title: "Servicio en curso",
                      description:
                        activeDriverService?.module === "cargo"
                          ? "Tienes un servicio activo de Taxi. Finalízalo o cancélalo para entrar a Delivery."
                          : "Tienes un servicio activo de Delivery. Finalízalo o cancélalo para entrar a Taxi.",
                      variant: "destructive",
                    });
                    return;
                  }
                  if (blockedByRiderService) {
                    toast({
                      title: "Servicio en curso",
                      description:
                        activeRiderService?.module === "cargo"
                          ? "Tienes un servicio activo de Taxi. Finalízalo o cancélalo para entrar a Delivery."
                          : "Tienes un servicio activo de Delivery. Finalízalo o cancélalo para entrar a Taxi.",
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
                <span className="max-w-[4.25rem] truncate text-[11px] leading-tight">{t.label}</span>
              </Button>
            );
          })}
        </div>
      </nav>
      </div>

      <Sheet open={driverMoreMenuOpen} onOpenChange={setDriverMoreMenuOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl border-t border-border px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 sm:mx-auto sm:max-w-md"
        >
          <SheetHeader className="space-y-1 pb-2 text-left">
            <SheetTitle className="font-display text-lg">Conductor</SheetTitle>
            <SheetDescription>Historial, ingresos y configuración del servicio.</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-2 py-2">
            {goDriverUi ? (
              <Button
                type="button"
                variant="outline"
                className="h-12 w-full justify-start gap-3 px-3 text-left font-normal"
                onClick={() => {
                  setDriverMoreMenuOpen(false);
                  goDriverUi.openHistory();
                }}
              >
                <History className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-foreground">Historial</span>
                  <span className="block text-xs text-muted-foreground">Viajes completados como conductor</span>
                </span>
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="h-12 w-full justify-start gap-3 px-3 text-left font-normal"
              onClick={() => {
                setDriverMoreMenuOpen(false);
                setDriverEarningsOpen(true);
              }}
            >
              <TrendingUp className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-foreground">Ingresos</span>
                <span className="block text-xs text-muted-foreground">Cartera y actividad</span>
              </span>
            </Button>
            {showPromocionesNav ? (
              <Button
                type="button"
                variant="outline"
                className="h-12 w-full justify-start gap-3 px-3 text-left font-normal"
                onClick={() => {
                  setDriverMoreMenuOpen(false);
                  setLocation("/promociones");
                }}
              >
                <Ticket className="h-5 w-5 shrink-0 text-mango-orange" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-foreground">Promociones</span>
                  <span className="block text-xs text-muted-foreground">
                    Códigos activos para tu mensualidad
                  </span>
                </span>
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="h-12 w-full justify-start gap-3 px-3 text-left font-normal"
              onClick={() => {
                setDriverMoreMenuOpen(false);
                setLocation(configHref);
              }}
            >
              <Settings className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-foreground">Configuración</span>
                <span className="block text-xs text-muted-foreground">Ajustes del conductor en Go</span>
              </span>
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={driverEarningsOpen} onOpenChange={setDriverEarningsOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[min(92dvh,720px)] overflow-y-auto overflow-x-hidden rounded-t-2xl p-4 sm:max-w-lg sm:mx-auto"
        >
          <SheetHeader className="text-left space-y-1.5 sm:pr-6">
            <SheetTitle className="font-display text-lg">Ingresos — Conductor</SheetTitle>
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
            <SheetTitle>{mobilityHistorySheetTitle()}</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-3 pb-6">
            {riderHistoryLoading ? (
              <p className="text-sm text-muted-foreground">Cargando historial…</p>
            ) : riderTripEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground leading-relaxed">
                Aún no hay servicios en tu historial. Aquí verás viajes completados, cancelados o expirados de Taxi y Delivery.
              </p>
            ) : (
              <ul className="space-y-3">
                {riderTripEntries.map((t) => (
                  <li key={t.id} className="rounded-xl border border-border bg-card px-4 py-3 text-sm shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium text-foreground">{new Date(t.endedAt).toLocaleString("es-EC")}</span>
                      {t.statusLabel ? (
                        <span
                          className={cn(
                            "text-xs font-medium shrink-0",
                            t.outcome === "cancelled" || t.outcome === "expired"
                              ? "text-destructive"
                              : "text-muted-foreground"
                          )}
                        >
                          {t.statusLabel}
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-muted-foreground">
                          Oferta: <span className="font-semibold tabular-nums text-foreground">{formatUsd(t.amountUsd ?? 0)}</span>
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground text-xs">
                      <span>
                        Servicio:{" "}
                        <span className="font-medium text-foreground">{mobilityServiceLabel(t.goSlug)}</span>
                      </span>
                      <span>Conductor: <span className="font-medium text-foreground">{t.driverName}</span></span>
                      <span>Duración: {t.durationMin} min</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={goQuickSettingsOpen} onOpenChange={setGoQuickSettingsOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[min(90dvh,680px)] overflow-y-auto rounded-t-2xl sm:mx-auto sm:max-w-lg"
        >
          <SheetHeader className="text-left space-y-1.5 sm:pr-6">
            <SheetTitle className="font-display text-lg">Configuración</SheetTitle>
            <SheetDescription>
              Preferencias rápidas; el perfil completo sigue en la misma sección Configuración del sitio.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-5">
            <QuickSettingsPanel
              returnPath={location.split("?")[0] || "/go/taxi"}
              onNavigate={() => setGoQuickSettingsOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

