import { cn } from "@/lib/utils";

type NotificationCardOptions = {
  read?: boolean;
  variant?: "default" | "go";
  className?: string;
};

/** Tarjeta de notificación — estilo Applia Store (coral suave). */
export function getNotificationCardClassName({
  read = false,
  variant = "default",
  className,
}: NotificationCardOptions = {}): string {
  return cn(
    "border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary/30",
    "border-border/70 bg-card hover:bg-muted/40",
    variant === "go"
      ? "w-full rounded-2xl px-3 py-3 text-left shadow-sm"
      : "w-full rounded-2xl p-3 text-left",
    !read && "border-l-[3px] border-l-secondary bg-secondary/[0.06]",
    read && "opacity-85",
    className,
  );
}

export function getNotificationTitleClassName(className?: string): string {
  return cn("text-sm font-semibold text-foreground", className);
}

export function getNotificationAccentCtaClassName(className?: string): string {
  return cn("mt-1.5 text-xs font-semibold text-secondary", className);
}
