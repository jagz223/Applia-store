import { Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

type StoreShowcaseAddToCartButtonProps = {
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  ariaLabel: string;
  className?: string;
  variant?: "overlay" | "footer";
};

export function StoreShowcaseAddToCartButton({
  onClick,
  disabled,
  busy,
  ariaLabel,
  className,
  variant = "overlay",
}: StoreShowcaseAddToCartButtonProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled || busy}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        variant === "overlay"
          ? [
              "absolute bottom-3 right-3 z-10",
              "bg-primary text-primary-foreground shadow-md",
              "hover:bg-primary/90",
            ]
          : [
              "relative shrink-0",
              "bg-card text-foreground border border-border shadow-sm",
              "hover:bg-muted/60",
            ],
        "flex h-9 w-9 items-center justify-center rounded-full",
        "active:scale-95 transition-transform",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        (disabled || busy) && "opacity-70 pointer-events-none",
        className,
      )}
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        <Plus className="h-5 w-5" strokeWidth={2.5} aria-hidden />
      )}
    </button>
  );
}

export function showcaseCartItemKey(kind: "product" | "promotion", id: number) {
  return kind === "product" ? `p-${id}` : `m-${id}`;
}
