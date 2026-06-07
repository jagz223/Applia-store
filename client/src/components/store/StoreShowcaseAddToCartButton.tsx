import { Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

type StoreShowcaseAddToCartButtonProps = {
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  ariaLabel: string;
  className?: string;
};

export function StoreShowcaseAddToCartButton({
  onClick,
  disabled,
  busy,
  ariaLabel,
  className,
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
        "absolute bottom-2 right-2 z-10",
        "flex h-9 w-9 items-center justify-center rounded-full",
        "bg-primary text-primary-foreground shadow-md",
        "hover:bg-primary/90 active:scale-95 transition-transform",
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
