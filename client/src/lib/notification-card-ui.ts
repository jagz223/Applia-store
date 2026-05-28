import { cn } from "@/lib/utils";

type NotificationCardOptions = {
  read?: boolean;
  /** Drawer Go: esquinas más redondeadas y sombra ligera. */
  variant?: "default" | "go";
  className?: string;
};

/**
 * Tarjeta de notificación unificada (borde y fondo naranja; claro/oscuro).
 * Solo diseño — el contenido (título, icono, descripción) lo define cada vista.
 */
export function getNotificationCardClassName({
  read = false,
  variant = "default",
  className,
}: NotificationCardOptions = {}): string {
  return cn(
    "border transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500/30",
    "border-orange-500/50 bg-orange-50 hover:bg-orange-100/90",
    "dark:border-orange-500/40 dark:bg-orange-500/10 dark:hover:bg-orange-500/15",
    variant === "go"
      ? "w-full rounded-xl px-3 py-3 text-left shadow-sm active:bg-orange-100 dark:active:bg-orange-500/20"
      : "w-full text-left p-3 rounded-lg hover:bg-orange-100/90 dark:hover:bg-orange-500/15",
    !read && "ring-1 ring-orange-500/40 dark:ring-orange-500/35",
    read && "bg-orange-50/60 dark:bg-orange-500/[0.06]",
    className,
  );
}

/** Título destacado (mismo acento que promociones). */
export function getNotificationTitleClassName(className?: string): string {
  return cn("font-medium text-sm text-orange-600 dark:text-orange-400", className);
}

/** CTA secundario (p. ej. promociones). */
export function getNotificationAccentCtaClassName(className?: string): string {
  return cn("text-xs font-semibold text-orange-600 dark:text-orange-400 mt-1.5", className);
}
