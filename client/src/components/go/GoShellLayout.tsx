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
            // En /go/cargo (PC) queremos layout real de escritorio, no “phone frame”.
            wideDesktop
              ? "sm:my-6 sm:max-w-6xl sm:rounded-2xl sm:border sm:border-border/60 sm:shadow-lg"
              : "max-w-md sm:my-6 sm:h-auto sm:max-h-[calc(100vh-3rem)] sm:max-h-[calc(100svh-3rem)] sm:min-h-[calc(100vh-3rem)] sm:min-h-[calc(100svh-3rem)] sm:rounded-2xl sm:border sm:border-border/60 sm:shadow-lg",
          ].join(" ")}
        >
          <header className="sticky top-0 z-40 shrink-0 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70">
            <div className="flex items-center justify-between px-3 py-2">
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
              // En vistas de mapa, no dejar “franja” encima de la barra inferior.
              isGoMapView ? "pb-0" : "pb-16",
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

