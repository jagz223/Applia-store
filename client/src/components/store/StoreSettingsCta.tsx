import { Link } from "wouter";
import { ChevronRight, Loader2, Store } from "lucide-react";
import { useMyStore, getMyStoreNavHref } from "@/hooks/use-my-store";
import { cn } from "@/lib/utils";

type StoreSettingsCtaProps = {
  onNavigate?: () => void;
  className?: string;
};

/**
 * CTA vistoso en configuración: crear tienda o ir a la tienda del usuario.
 */
export function StoreSettingsCta({ onNavigate, className }: StoreSettingsCtaProps) {
  const { data: myStore, isLoading } = useMyStore();

  if (isLoading) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-xl border border-border bg-muted/20 px-4 py-6",
          className,
        )}
      >
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }

  const href = myStore ? getMyStoreNavHref(myStore) ?? "/tienda/crear" : "/tienda/crear";
  const title = myStore ? "Mi tienda" : "Crear Tienda";
  const description = myStore
    ? myStore.visibilityActive
      ? `Administra «${myStore.name}» desde el panel de productos.`
      : `Gestiona «${myStore.name}» — activa la mensualidad para publicar.`
    : "Abre tu tienda online en GenFeb. Publica productos con una mensualidad aparte.";

  return (
    <Link href={href} onClick={onNavigate} className={cn("block group", className)}>
      <div
        className={cn(
          "relative overflow-hidden rounded-xl border border-primary/25 p-4 sm:p-5",
          "bg-gradient-to-br from-primary/15 via-violet-500/10 to-emerald-500/10",
          "shadow-sm transition-all duration-200",
          "hover:border-primary/40 hover:shadow-md active:scale-[0.99]",
        )}
      >
        <div
          className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-primary/10 blur-2xl"
          aria-hidden
        />
        <div className="relative flex items-center gap-4">
          <div
            className={cn(
              "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl",
              "bg-gradient-to-br from-primary to-violet-600 text-primary-foreground shadow-md",
            )}
          >
            <Store className="h-6 w-6" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-foreground text-base sm:text-lg">{title}</p>
            <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{description}</p>
          </div>
          <ChevronRight
            className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
            aria-hidden
          />
        </div>
      </div>
    </Link>
  );
}
