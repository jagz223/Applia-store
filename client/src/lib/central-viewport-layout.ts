import type { CSSProperties } from "react";

/** Mismo breakpoint que Go: móvil/tablet vertical hasta 1023px. */
export const CENTRAL_COMPACT_MAX_WIDTH_PX = 1023;

export const centralViewportStyle = {
  "--central-bottom-nav-height": "4.25rem",
} as const satisfies Record<string, string>;

export const centralViewportCssVars = centralViewportStyle as CSSProperties;

export function centralOffsetAboveBottomNav(extra = "0px"): string {
  return `calc(var(--central-bottom-nav-height, 4.25rem) + env(safe-area-inset-bottom, 0px) + ${extra})`;
}

export const centralViewportClasses = {
  root: "fixed inset-0 z-0 flex h-[100dvh] max-h-[100dvh] min-h-0 w-full flex-col overflow-hidden overscroll-none bg-background",
  mapStage: "relative flex h-0 min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden",
  scrollPanel:
    "flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain px-4 pt-3 pb-[calc(var(--central-bottom-nav-height,4.25rem)+env(safe-area-inset-bottom,0px)+1rem)]",
  bottomNav:
    "relative z-[1100] shrink-0 border-t border-border/90 bg-background/98 pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-6px_28px_-4px_rgba(0,0,0,0.12)] backdrop-blur-md supports-[backdrop-filter]:bg-background/92",
  mapOverlayTop:
    "pointer-events-none absolute inset-x-0 top-0 z-30 flex flex-col gap-1.5 px-3 pt-[max(0.35rem,env(safe-area-inset-top))]",
  mapOverlayChip:
    "pointer-events-auto rounded-full border border-border/70 bg-background/92 px-2.5 py-1 text-[11px] font-medium shadow-md backdrop-blur-sm",
} as const;
