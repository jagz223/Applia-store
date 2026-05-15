import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/**
 * Contrato de layout para vistas Go (taxi/delivery).
 * Breakpoint compacto = teléfono + tablet vertical (hasta 1023px). A partir de 1024px = escritorio.
 */

/** Alineado con Tailwind `max-lg` / `lg:` (1024px). */
export const GO_COMPACT_MAX_WIDTH_PX = 1023;

export const GO_VIEWPORT_CSS_VARS = {
  "--go-bottom-nav-height": "4.75rem",
  "--go-shell-header-height": "3.25rem",
} as const;

export const goViewportStyle = GO_VIEWPORT_CSS_VARS as CSSProperties;

/** Offset desde el borde inferior del viewport hasta el inicio del área útil sobre la barra. */
export function goOffsetAboveBottomNav(extra = "0px"): string {
  return `calc(var(--go-bottom-nav-height, 4.75rem) + env(safe-area-inset-bottom, 0px) + ${extra})`;
}

export const goViewportClasses = {
  /** Raíz GoShell en vistas mapa: viewport fijo sin scroll de documento (móvil + tablet). */
  shellRootMapCompact:
    "max-lg:fixed max-lg:inset-0 max-lg:z-0 max-lg:flex max-lg:h-[100dvh] max-lg:max-h-[100dvh] max-lg:min-h-0 max-lg:w-full max-lg:flex-col max-lg:overflow-hidden max-lg:overscroll-none",

  /** Marco interior en compacto: llena el padre (sin 100vh suelto ni márgenes sm). */
  shellFrameMapCompact:
    "max-lg:my-0 max-lg:flex max-lg:h-full max-lg:max-h-full max-lg:min-h-0 max-lg:flex-1 max-lg:max-w-none max-lg:rounded-none max-lg:shadow-none max-lg:border-0",

  shellMainMap: "relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden pb-0",

  /** Barra inferior como último hijo flex del shell. */
  bottomNavFlexAnchor:
    "relative z-50 shrink-0 border-t border-border/90 bg-background/98 pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-6px_28px_-4px_rgba(0,0,0,0.12)] backdrop-blur-md supports-[backdrop-filter]:bg-background/92 dark:shadow-[0_-6px_32px_-4px_rgba(0,0,0,0.45)]",

  /** Escenario mapa: flex-1 + h-0 evita colapso en cadenas flex anidadas. */
  mapStage: "relative flex h-0 min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden",

  mapControlsDock:
    "pointer-events-none relative z-40 mt-auto w-full shrink-0 px-3 pt-2 pb-1",

  /**
   * Hueco lateral bajo FAB “Inicio” del shell compacto (`px-3` + botón ~2.5rem + margen).
   * Usar en overlays superpuestos (banner conductor, panel pasajero) para evitar texto bajo el logo.
   */
  shellFabOverlayInsetLeft: "pl-[3.75rem]",
} as const;

export function goViewportShellRootClass(isGoMapView: boolean): string {
  return cn(isGoMapView && goViewportClasses.shellRootMapCompact);
}

export function goViewportShellRootSurfaceClass(isGoMapView: boolean): string {
  return cn(
    "bg-muted/20 font-sans",
    isGoMapView ? "max-lg:min-h-0 max-lg:h-[100dvh]" : "min-h-screen",
  );
}

export function goViewportShellFrameClass(isGoMapView: boolean, wideDesktop: boolean): string {
  const base = "mx-auto flex w-full min-h-0 flex-col overflow-hidden bg-background";

  if (isGoMapView) {
    return cn(
      base,
      goViewportClasses.shellFrameMapCompact,
      wideDesktop &&
        "lg:my-6 lg:h-[min(100dvh,960px)] lg:max-h-[100dvh] lg:max-w-[min(1340px,94vw)] lg:flex-none lg:rounded-3xl lg:border lg:border-border/55 lg:shadow-xl",
    );
  }

  return cn(
    base,
    "h-screen h-[100dvh] max-h-screen max-h-[100dvh]",
    wideDesktop
      ? "sm:my-4 sm:max-w-[min(1200px,96vw)] md:my-6 md:max-w-[min(1340px,94vw)] lg:rounded-3xl lg:border lg:border-border/55 lg:shadow-xl"
      : "max-w-md sm:my-6 sm:h-auto sm:max-h-[calc(100dvh-3rem)] sm:min-h-[calc(100dvh-3rem)] sm:rounded-2xl sm:border sm:border-border/60 sm:shadow-lg",
  );
}

export function isGoDriverMapPath(pathname: string): boolean {
  return (
    pathname === "/go/taxi/driver" ||
    pathname.startsWith("/go/taxi/driver/") ||
    pathname === "/go/cargo/driver" ||
    pathname.startsWith("/go/cargo/driver/") ||
    pathname === "/go/delivery/driver" ||
    pathname.startsWith("/go/delivery/driver/") ||
    pathname === "/go/pack/driver" ||
    pathname.startsWith("/go/pack/driver/")
  );
}

export function isGoDriverMapPathWithoutSettings(pathname: string): boolean {
  if (!isGoDriverMapPath(pathname)) return false;
  return !pathname.endsWith("/settings");
}

/** Cliente pidiendo taxi o delivery (rutas canónicas sin /driver ni /settings). */
export function isGoRiderMapPathWithoutSettings(pathname: string): boolean {
  if (!pathname || pathname.endsWith("/settings")) return false;
  const p = pathname.split("?")[0]?.trim() ?? pathname;
  if (p.includes("/driver")) return false;
  return /^\/go\/(taxi|cargo|delivery|pack)$/.test(p);
}

export function shouldShowCompactGoShellHomeFab(isGoMapView: boolean, pathnameClean: string): boolean {
  if (!isGoMapView || pathnameClean.endsWith("/settings")) return false;
  return isGoDriverMapPathWithoutSettings(pathnameClean) || isGoRiderMapPathWithoutSettings(pathnameClean);
}

export function goViewportShellRibbonWrapperClass(compactViewport: boolean, isGoMapView: boolean): string {
  return cn(isGoMapView && compactViewport && "hidden");
}

export function goViewportBottomNavWrapperClass(pinToViewportBottom: boolean, useDesktopDockStyle: boolean): string {
  return cn(
    "shrink-0 z-50",
    pinToViewportBottom ? goViewportClasses.bottomNavFlexAnchor : "sticky bottom-0",
    useDesktopDockStyle &&
      "pointer-events-none lg:bg-gradient-to-t lg:from-background/85 lg:to-transparent lg:pb-5 lg:pt-4",
  );
}

/** true = layout compacto (mapa fullscreen + barra anclada al fondo del viewport). */
export function useGoCompactViewport(): boolean {
  const [compact, setCompact] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia(`(max-width: ${GO_COMPACT_MAX_WIDTH_PX}px)`).matches
      : false,
  );

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${GO_COMPACT_MAX_WIDTH_PX}px)`);
    const fn = () => setCompact(mq.matches);
    fn();
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);

  return compact;
}
