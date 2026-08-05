import { cn } from "@/lib/utils";

/** Shell del portal: hoja inferior en móvil, centrado en desktop. */
export const storeAdminDialogShellClass =
  "items-end justify-end p-0 sm:items-center sm:justify-center sm:p-4 sm:pt-[4.5rem] sm:pb-4";

/** Contenido del diálogo admin (crear/editar). */
export function storeAdminDialogContentClass(extra?: string) {
  return cn(
    "!flex flex w-full max-w-lg flex-col gap-0 overflow-hidden border-border/70 bg-background p-0 shadow-xl",
    "h-[min(92dvh,40rem)] max-h-[min(92dvh,40rem)] min-h-0 rounded-t-[1.5rem]",
    "sm:h-auto sm:max-h-[min(85dvh,40rem)] sm:rounded-2xl",
    extra,
  );
}

export const storeAdminDialogHeaderClass =
  "shrink-0 space-y-1 border-b border-border/60 px-4 pb-3 pt-5 text-left sm:px-6 sm:pt-6";

export const storeAdminDialogBodyClass =
  "min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5";

export const storeAdminDialogFooterClass = cn(
  "shrink-0 flex-col-reverse gap-2 border-t border-border/60 bg-background/95 px-4 py-3",
  "pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm",
  "sm:flex-row sm:justify-end sm:gap-2 sm:px-6 sm:py-4 sm:pb-4",
);

export const storeAdminFieldClass =
  "h-11 rounded-2xl border-border/80 bg-muted/40 px-4 shadow-none focus-visible:ring-secondary dark:focus-visible:ring-primary";

export const storeAdminSectionCardClass =
  "rounded-[1.5rem] border border-border/70 bg-card/95 shadow-sm";
