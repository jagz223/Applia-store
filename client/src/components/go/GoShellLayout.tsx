import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Home } from "lucide-react";
import { GoBottomNav } from "@/components/go/GoBottomNav";
import { GoChatDrawer } from "@/components/go/GoChatDrawer";
import { GoChatProvider } from "@/contexts/GoChatContext";
import { GoDriverUiProvider } from "@/contexts/GoDriverUiContext";
import { GoNotificationsProvider } from "@/contexts/GoNotificationsContext";
import { GoNotificationsDrawer } from "@/components/go/GoNotificationsDrawer";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";
import { useSocket } from "@/hooks/use-socket";
import { GoChatAutoCloseOnRideEnd } from "@/components/go/GoChatAutoCloseOnRideEnd";
import { GoChatBadgeOnMessage } from "@/components/go/GoChatBadgeOnMessage";

export function GoShellLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { socket } = useSocket();
  const headerTitle = location.startsWith("/go/cargo")
    ? "Car Go"
    : location.startsWith("/go/pack")
      ? "Pack Go"
      : location.startsWith("/go/shop")
        ? "Shop Go"
        : "Movilidad y envíos";
  const wideDesktop = location.startsWith("/go/cargo") || location.startsWith("/go/pack");
  /** En mapa/viaje hacemos overflow hidden; en ajustes el contenido debe desplazarse en móvil. */
  const mainScrollOnMobile =
    location === "/go/cargo/driver/settings" || location === "/go/pack/driver/settings";
  const isGoMapView =
    location === "/go/cargo" || location === "/go/cargo/driver" || location === "/go/pack" || location === "/go/pack/driver";

  useEffect(() => {
    if (!socket) return;
    socket.emit("go:path", { path: location });
  }, [socket, location]);

  return (
    <GoChatProvider>
      <GoNotificationsProvider>
        <GoDriverUiProvider>
          <GoChatAutoCloseOnRideEnd />
          <GoChatBadgeOnMessage />
      <div className="min-h-screen bg-muted/20 font-sans">
        {/* Desktop: centramos un “phone frame” pero la sección funciona igual */}
        <div
          className={[
            "mx-auto flex h-screen h-[100svh] max-h-screen max-h-[100svh] min-h-0 w-full flex-col overflow-hidden bg-background",
            "max-md:overscroll-none",
            // Escritorio Car/Pack Go: Marco amplio pero no “tubo”; barra inferior flota dentro (GoBottomNav md).
            wideDesktop
              ? "sm:my-4 sm:max-w-[min(1200px,96vw)] md:my-6 md:max-w-[min(1340px,94vw)] lg:rounded-3xl lg:border lg:border-border/55 lg:shadow-xl"
              : "max-w-md sm:my-6 sm:h-auto sm:max-h-[calc(100vh-3rem)] sm:max-h-[calc(100svh-3rem)] sm:min-h-[calc(100vh-3rem)] sm:min-h-[calc(100svh-3rem)] sm:rounded-2xl sm:border sm:border-border/60 sm:shadow-lg",
          ].join(" ")}
        >
          <header className="sticky top-0 z-40 shrink-0 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70 md:rounded-t-[inherit]">
            <div className="flex items-center justify-between px-4 py-2.5 md:px-6 md:py-3">
              <Button asChild variant="ghost" size="sm" className="gap-2">
                <Link href="/">
                  <Home className="h-4 w-4" />
                  Inicio
                </Link>
              </Button>
              <p className="text-sm font-semibold text-foreground">{headerTitle}</p>
              {/* Spacer para centrar el título */}
              <div className="w-[72px]" aria-hidden />
            </div>
          </header>
          <main
            className={[
              "flex min-h-0 min-w-0 flex-1 flex-col",
              // En mapa: espacio inferior en PC para que el dock no tape contenido pegado abajo.
              isGoMapView ? "pb-0 md:pb-1" : "pb-16",
              mainScrollOnMobile
                ? "max-md:h-full max-md:min-h-0 max-md:overflow-y-auto max-md:overscroll-y-contain"
                : "max-md:h-full max-md:overflow-hidden",
              // Car Go en PC: scroll vertical si hace falta; `overflow-hidden` recortaba el mapa Leaflet a veces.
              wideDesktop ? "md:overflow-y-auto md:overscroll-y-contain" : "md:overflow-y-auto",
            ].join(" ")}
          >
            {children}
          </main>
          <GoBottomNav />
        </div>
        <GoChatDrawer />
        <GoNotificationsDrawer />
      </div>
        </GoDriverUiProvider>
      </GoNotificationsProvider>
    </GoChatProvider>
  );
}

