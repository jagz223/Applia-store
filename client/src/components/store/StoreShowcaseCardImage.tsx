import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type StoreShowcaseCardImageProps = {
  src?: string | null;
  aspect?: "landscape" | "square";
  placeholderIcon: LucideIcon;
  className?: string;
};

export function StoreShowcaseCardImage({
  src,
  aspect = "landscape",
  placeholderIcon: PlaceholderIcon,
  className,
}: StoreShowcaseCardImageProps) {
  const imageUrl = src?.trim();

  return (
    <div
      className={cn(
        "relative w-full shrink-0 overflow-hidden bg-muted/30",
        aspect === "square" ? "aspect-square min-h-[9rem]" : "aspect-[3/2] min-h-[8rem]",
        className,
      )}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          className="block h-full w-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground/70">
          <PlaceholderIcon
            className={aspect === "square" ? "h-12 w-12" : "h-16 w-16"}
            strokeWidth={1.25}
            aria-hidden
          />
        </div>
      )}
    </div>
  );
}
