import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import type { StoreShowcaseCategory } from "@/hooks/use-store-showcase";
import { cn } from "@/lib/utils";

export type ShowcaseCategoryFilter = "all" | "promotions" | number;

type StoreShowcaseFiltersProps = {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  categoryFilter: ShowcaseCategoryFilter;
  onCategoryChange: (value: ShowcaseCategoryFilter) => void;
  categories: StoreShowcaseCategory[];
  showPromotionsFilter?: boolean;
  className?: string;
};

export function StoreShowcaseFilters({
  searchQuery,
  onSearchChange,
  categoryFilter,
  onCategoryChange,
  categories,
  showPromotionsFilter,
  className,
}: StoreShowcaseFiltersProps) {
  return (
    <Card className={cn("rounded-2xl border-border shadow-sm", className)}>
      <CardContent className="p-4 space-y-3">
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none"
            aria-hidden
          />
          <Input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="¿Estás buscando algo especifico? Coloca el nombre acá"
            className="h-11 rounded-full border-border/80 bg-muted/40 pl-10 text-sm shadow-none focus-visible:ring-primary/30"
            aria-label="Buscar productos por nombre"
          />
        </div>

        <div
          className={cn(
            "flex flex-nowrap gap-2 overflow-x-auto overscroll-x-contain pb-0.5",
            "scroll-smooth [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5",
            "[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30",
            "[&::-webkit-scrollbar-track]:bg-transparent",
          )}
        >
          <CategoryChip
            label="Todo"
            active={categoryFilter === "all"}
            onClick={() => onCategoryChange("all")}
          />
          {showPromotionsFilter ? (
            <CategoryChip
              label="Promociones"
              active={categoryFilter === "promotions"}
              onClick={() => onCategoryChange("promotions")}
            />
          ) : null}
          {categories.map((cat) => (
            <CategoryChip
              key={cat.id}
              label={cat.name}
              active={categoryFilter === cat.id}
              onClick={() => onCategoryChange(cat.id)}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        active
          ? "border-primary bg-primary text-primary-foreground shadow-sm"
          : "border-border bg-card text-foreground hover:bg-muted/60",
      )}
    >
      {label}
    </button>
  );
}
