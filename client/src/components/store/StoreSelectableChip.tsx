import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Chip seleccionable con colores del tema (admin / formularios de tienda). */
export function StoreSelectableChip({
  active,
  disabled,
  onClick,
  children,
  className,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "border-primary bg-primary text-primary-foreground shadow-sm"
          : "border-border bg-background text-foreground hover:border-primary/40 hover:bg-muted/60",
        disabled && "cursor-not-allowed opacity-60",
        className,
      )}
    >
      {children}
      {active ? <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden /> : null}
    </button>
  );
}
