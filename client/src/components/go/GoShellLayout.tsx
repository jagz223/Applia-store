import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Home } from "lucide-react";
import { GoBottomNav } from "@/components/go/GoBottomNav";
import { GoChatDrawer } from "@/components/go/GoChatDrawer";
import { GoChatProvider } from "@/contexts/GoChatContext";
import { GoDriverUiProvider } from "@/contexts/GoDriverUiContext";
import { GoDriverSessionProvider } from "@/contexts/GoDriverSessionContext";
import { GoNotificationsProvider } from "@/contexts/GoNotificationsContext";
import { GoNotificationsDrawer } from "@/components/go/GoNotificationsDrawer";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { GoChatAutoCloseOnRideEnd } from "@/components/go/GoChatAutoCloseOnRideEnd";
import { GoChatBadgeOnMessage } from "@/components/go/GoChatBadgeOnMessage";
import { GoChatOpenFromQuery } from "@/components/go/GoChatOpenFromQuery";
import { GoClientPresenceReporter } from "@/components/go/GoClientPresenceReporter";
import { DriverFloatingBubble } from "@/components/go/DriverFloatingBubble";
import { DriverBubbleScreenOverlay } from "@/components/go/DriverBubbleScreenOverlay";
import { AndroidOverlayPermissionFeedback } from "@/components/go/AndroidOverlayPermissionFeedback";
import { GoDriverBubbleProvider, useGoDriverBubbleOptional } from "@/contexts/GoDriverBubbleContext";
import { ListingSubscriptionRibbon } from "@/components/ListingSubscriptionRibbon";
import {
  goViewportClasses,
  goViewportShellFrameClass,
  goViewportShellRootClass,
  goViewportShellRootSurfaceClass,
  goViewportShellRibbonWrapperClass,
  goViewportStyle,
  shouldShowCompactGoShellHomeFab,
  useGoCompactViewport,
} from "@/lib/go-viewport-layout";

export function GoShellLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const driverBubble = useGoDriverBubbleOptional();
  const isUnifiedDriver =
    location === "/go/driver" || location.startsWith("/go/driver/");
  const headerTitle = isUnifiedDriver
    ? "Panel conductor"
    : location.startsWith("/go/taxi") || location.startsWith("/go/cargo")
      ? "Servicio de taxi"
      : location.startsWith("/go/delivery") || location.startsWith("/go/pack")
        ? "Delivery"
        : location.startsWith("/go/shop")
          ? "Pedidos"
          : "Movilidad y envíos";
  const wideDesktop =
    isUnifiedDriver ||
    location.startsWith("/go/taxi") ||
    location.startsWith("/go/cargo") ||
    location.startsWith("/go/delivery") ||
    location.startsWith("/go/pack");
  /** En mapa/viaje hacemos overflow hidden; en ajustes el contenido debe desplazarse en móvil. */
  const mainScrollOnMobile =
    location === "/go/driver/settings" ||
    location === "/go/taxi/driver/settings" ||
    location === "/go/cargo/driver/settings" ||
    location === "/go/delivery/driver/settings" ||
    location === "/go/pack/driver/settings";
  const isGoMapView =
    location === "/go/driver" ||
    isUnifiedDriver ||
    location === "/go/taxi" ||
    location === "/go/taxi/driver" ||
    location === "/go/cargo" ||
    location === "/go/cargo/driver" ||
    location === "/go/delivery" ||
    location === "/go/delivery/driver" ||
    location === "/go/pack" ||
    location === "/go/pack/driver";
  const pathname = location.split("?")[0] ?? location;
  const compactGoViewport = useGoCompactViewport();
  const showCompactGoHomeFab =
    shouldShowCompactGoShellHomeFab(isGoMapView, pathname) &&
    !(isUnifiedDriver && driverBubble?.shellCollapsed);
  const hideShellChromeForBubble =
    isUnifiedDriver && driverBubble?.enabled === true && driverBubble.shellCollapsed;

  /** Evita scroll del documento en móvil: el mapa no debe “robar” el gesto de llegar a la barra inferior. */
  useEffect(() => {
    if (!isGoMapView) return;
    const prevHtml = document.documentElement.style.overflow;
    const prevBody = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prevHtml;
      document.body.style.overflow = prevBody;
    };
  }, [isGoMapView]);

  return (
    <GoChatProvider>
      <GoNotificationsProvider>
        <GoDriverSessionProvider>
          <GoDriverBubbleProvider>
            <GoDriverUiProvider>
              <GoChatAutoCloseOnRideEnd />
              <GoClientPresenceReporter path={location} />
              <DriverFloatingBubble />
              <DriverBubbleScreenOverlay />
              <AndroidOverlayPermissionFeedback enabled={isUnifiedDriver} />
          <GoChatBadgeOnMessage />
          <GoChatOpenFromQuery />
          <div className={cn(goViewportShellRootSurfaceClass(isGoMapView), goViewportShellRootClass(isGoMapView))}>
            <div
              className={goViewportShellFrameClass(isGoMapView, wideDesktop)}
              style={isGoMapView ? goViewportStyle : undefined}
            >
              <header
                className={cn(
                  "sticky top-0 z-40 shrink-0 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70 lg:rounded-t-[inherit]",
                  isGoMapView && compactGoViewport && "hidden",
                  hideShellChromeForBubble && "max-lg:hidden",
                )}
              >
                <div className="flex items-center justify-between px-4 py-2.5 md:px-6 md:py-3">
                  <Button asChild variant="ghost" size="sm" className="gap-2">
                    <Link href="/">
                      <Home className="h-4 w-4" />
                      Inicio
                    </Link>
                  </Button>
                  <p className="text-sm font-semibold text-foreground">{headerTitle}</p>
                  <div className="w-[72px]" aria-hidden />
                </div>
              </header>
              <main
                className={[
                  isGoMapView ? goViewportClasses.shellMainMap : "flex min-h-0 min-w-0 flex-1 flex-col",
                  !isGoMapView && "pb-16",
                  isGoMapView && "lg:pb-1",
                  mainScrollOnMobile
                    ? "max-lg:h-full max-lg:min-h-0 max-lg:overflow-y-auto max-lg:overscroll-y-contain"
                    : "max-lg:h-full max-lg:overflow-hidden",
                  wideDesktop ? "lg:overflow-y-auto lg:overscroll-y-contain" : "lg:overflow-y-auto",
                ].join(" ")}
              >
                <div className={goViewportShellRibbonWrapperClass(compactGoViewport, isGoMapView)}>
                  <ListingSubscriptionRibbon />
                </div>
                {showCompactGoHomeFab && compactGoViewport ? (
                  <div className="pointer-events-none absolute inset-x-0 top-0 z-[45] flex justify-start px-3 pt-[max(0.35rem,env(safe-area-inset-top))]">
                    <Button
                      asChild
                      variant="secondary"
                      size="icon"
                      className="pointer-events-auto size-10 shrink-0 overflow-hidden rounded-full border border-border/60 bg-background/90 p-1 shadow-md backdrop-blur-sm"
                    >
                      {/*
                        El hijo de asChild debe heredar solo tamaño del botón; sin h-full/w-full en el `<a>`
                        para evitar resolver el % contra el `main` y ver el logo a pantalla completa.
                      */}
                      <Link href="/" aria-label="Inicio GenFeb">
                        <span
                          className="mx-auto flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full ring-1 ring-border/55"
                          aria-hidden
                        >
                          <img
                            src="/genfeb-logo-new.png"
                            alt=""
                            className="size-full object-contain"
                            width={28}
                            height={28}
                            decoding="async"
                          />
                        </span>
                      </Link>
                    </Button>
                  </div>
                ) : null}
                {children}
              </main>
              <GoBottomNav pinToViewportBottom={isGoMapView} />
            </div>
            <GoChatDrawer />
            <GoNotificationsDrawer />
          </div>
          </GoDriverUiProvider>
          </GoDriverBubbleProvider>
        </GoDriverSessionProvider>
      </GoNotificationsProvider>
    </GoChatProvider>
  );
}
