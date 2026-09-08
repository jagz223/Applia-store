import { useEffect, useMemo, useRef, useState } from "react";
import { ImageIcon, Loader2, Percent } from "lucide-react";
import type { StoreShowcasePromotion } from "@/hooks/use-store-showcase";
import {
  STORE_ADMIN_LIST_PAGE_SIZE,
  StoreAdminListPagination,
} from "@/components/store/StoreAdminListPagination";
import { cn } from "@/lib/utils";

const PAGE_SIZE = STORE_ADMIN_LIST_PAGE_SIZE;

function formatPrice(value: number) {
  return new Intl.NumberFormat("es-VE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function ShowcasePromotionCard({
  promotion,
  onSelect,
  selected,
}: {
  promotion: StoreShowcasePromotion;
  onSelect?: () => void;
  selected?: boolean;
}) {
  const imageUrl = (promotion.promotionImageUrl ?? promotion.imageUrl)?.trim();
  const description = promotion.description?.trim() ?? "";
  const itemsHint =
    promotion.items.length === 0
      ? ""
      : promotion.items.length === 1
        ? "1 producto incluido"
        : `${promotion.items.length} productos incluidos`;

  return (
    <article
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onClick={onSelect}
      onKeyDown={
        onSelect
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect();
              }
            }
          : undefined
      }
      className={cn(
        "group flex flex-col overflow-hidden rounded-xl sm:rounded-2xl border border-border/80 bg-card shadow-sm",
        "min-h-0 sm:min-h-[17.5rem]",
        "transition-all",
        onSelect && "cursor-pointer hover:border-border hover:shadow-md",
        selected && "border-foreground/40 ring-2 ring-foreground/80 shadow-md",
      )}
    >
      <div className="relative bg-background p-2 sm:p-3 pb-0">
        <div className="relative aspect-square sm:aspect-[5/4] overflow-hidden rounded-lg sm:rounded-xl bg-background">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt=""
              className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-[1.02]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-background">
              <Percent className="h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground/40" aria-hidden />
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-0.5 px-2.5 pb-3 pt-2 sm:gap-1 sm:px-3.5 sm:pb-4 sm:pt-3">
        <p className="text-[13px] sm:text-sm font-bold leading-snug line-clamp-2 text-foreground">
          {promotion.name}
        </p>
        <p className="text-[13px] sm:text-sm font-semibold text-foreground">
          {formatPrice(promotion.price)}
        </p>
        {description ? (
          <p className="mt-0.5 line-clamp-1 sm:line-clamp-2 text-xs text-muted-foreground">
            {description}
          </p>
        ) : null}
        {itemsHint ? (
          <p className={cn("line-clamp-1 text-xs text-muted-foreground", !description && "mt-0.5")}>
            {itemsHint}
          </p>
        ) : null}
      </div>
    </article>
  );
}

type StoreShowcasePromotionGridProps = {
  promotions: StoreShowcasePromotion[];
  isLoading?: boolean;
  error?: Error | null;
  emptyMessage?: string;
  className?: string;
  centered?: boolean;
  largeCards?: boolean;
  onSelectPromotion?: (promotion: StoreShowcasePromotion) => void;
  selectedPromotionId?: number | null;
};

export function StoreShowcasePromotionGrid({
  promotions,
  isLoading,
  error,
  emptyMessage = "No hay promociones activas en este momento.",
  className,
  centered = false,
  largeCards = false,
  onSelectPromotion,
  selectedPromotionId,
}: StoreShowcasePromotionGridProps) {
  const [page, setPage] = useState(1);
  const topRef = useRef<HTMLDivElement>(null);
  const listKey = useMemo(() => promotions.map((p) => p.id).join(","), [promotions]);

  useEffect(() => {
    setPage(1);
  }, [listKey]);

  const totalPages = Math.max(1, Math.ceil(promotions.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagePromotions = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return promotions.slice(start, start + PAGE_SIZE);
  }, [promotions, safePage]);

  const goToPage = (next: number) => {
    setPage(next);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (isLoading) {
    return (
      <div className={cn("py-12 flex justify-center", className)}>
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <p className={cn("text-sm text-destructive text-center py-8", className)}>{error.message}</p>
    );
  }

  if (promotions.length === 0) {
    return (
      <div
        className={cn(
          "rounded-[1.25rem] border border-dashed border-border bg-card/60 py-12 px-6 text-center",
          className,
        )}
      >
        <ImageIcon className="h-10 w-10 mx-auto text-muted-foreground mb-3" aria-hidden />
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  const gridClass = largeCards
    ? "grid grid-cols-2 md:grid-cols-3 gap-2.5 sm:gap-4"
    : centered
      ? "flex flex-wrap justify-center gap-4 max-w-2xl mx-auto"
      : "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 sm:gap-4";

  return (
    <div ref={topRef} className={cn("space-y-4", className)}>
      <div className={gridClass}>
        {pagePromotions.map((promotion) => (
          <div
            key={promotion.id}
            className={centered && !largeCards ? "w-[calc(50%-0.5rem)] sm:w-[180px]" : undefined}
          >
            <ShowcasePromotionCard
              promotion={promotion}
              selected={selectedPromotionId === promotion.id}
              onSelect={onSelectPromotion ? () => onSelectPromotion(promotion) : undefined}
            />
          </div>
        ))}
      </div>
      <StoreAdminListPagination page={safePage} totalPages={totalPages} onPageChange={goToPage} />
    </div>
  );
}
