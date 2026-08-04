import { useEffect, useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import { ChevronRight, Loader2, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { hasAdminRole } from "@/lib/auth-utils";
import { useStoreBySlug } from "@/hooks/use-my-store";
import { useStoreShowcaseProducts } from "@/hooks/use-store-showcase";
import { useAddToStoreCart } from "@/hooks/use-store-cart";
import { StoreShowcaseProductGrid } from "@/components/store/StoreShowcaseProductGrid";
import { StoreShowcasePromotionGrid } from "@/components/store/StoreShowcasePromotionGrid";
import { StoreCartPanel } from "@/components/store/StoreCartPanel";
import { showcaseCartItemKey } from "@/components/store/StoreShowcaseAddToCartButton";
import {
  StoreShowcaseFilters,
  type ShowcaseCategoryFilter,
} from "@/components/store/StoreShowcaseFilters";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

type StorePayload = {
  id: number;
  name: string;
  slug: string;
  coverImageUrl?: string | null;
};

function StoreAdminSidePanel({ store }: { store: StorePayload }) {
  return (
    <div className="flex h-full w-[min(100%,22rem)] flex-col rounded-xl border border-border bg-card shadow-sm">
      <div className="border-b border-border px-4 py-3">
        <p className="text-sm font-semibold text-foreground">Administración</p>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <Link
          href={`/tienda/${encodeURIComponent(store.slug)}/admin/configuracion`}
          className="group block"
        >
          <div
            className={cn(
              "flex items-center gap-3 rounded-xl border border-primary/25 p-4",
              "bg-gradient-to-br from-primary/10 via-background to-accent/10",
              "transition-colors hover:border-primary/40 hover:bg-primary/5",
            )}
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Settings className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-foreground">Configuración de la tienda</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Productos, categorías, órdenes y datos
              </p>
            </div>
            <ChevronRight
              className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
              aria-hidden
            />
          </div>
        </Link>
        <Button variant="outline" className="w-full justify-start gap-2" asChild>
          <Link href={`/tienda/${encodeURIComponent(store.slug)}/admin/productos`}>
            <Settings className="h-4 w-4" aria-hidden />
            Ir al panel de productos
          </Link>
        </Button>
      </div>
    </div>
  );
}

export default function StorePage() {
  const [, params] = useRoute("/tienda/:slug");
  const slug = params?.slug ?? "";
  const { user, isAuthenticated } = useAuth();
  const isAdmin = hasAdminRole(user);
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<ShowcaseCategoryFilter>("all");

  const { data, isLoading, error } = useStoreBySlug(slug, Boolean(slug));
  const storeId = data?.store?.id ?? 0;
  const addToCartMutation = useAddToStoreCart(storeId);
  const canLoadShowcase = Boolean(slug) && !isLoading && Boolean(data?.store);
  const {
    data: showcaseData,
    isLoading: showcaseLoading,
    error: showcaseError,
  } = useStoreShowcaseProducts(slug, canLoadShowcase);

  useEffect(() => {
    setSearchQuery("");
    setCategoryFilter("all");
  }, [slug]);

  const showcaseProducts = showcaseData?.products ?? [];
  const showcaseCategories = showcaseData?.categories ?? [];
  const showcasePromotions = showcaseData?.promotions ?? [];
  const hasShowcaseFilters = showcaseProducts.length > 0 || showcasePromotions.length > 0;
  const showingPromotions = categoryFilter === "promotions";

  const filteredShowcaseProducts = useMemo(() => {
    let list = showcaseProducts;
    if (typeof categoryFilter === "number") {
      list = list.filter((p) => (p.categoryIds ?? []).includes(categoryFilter));
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    return list;
  }, [showcaseProducts, categoryFilter, searchQuery]);

  const filteredShowcasePromotions = useMemo(() => {
    let list = showcasePromotions;
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.description?.toLowerCase().includes(q) ?? false),
      );
    }
    return list;
  }, [showcasePromotions, searchQuery]);

  if (isLoading) {
    return (
      <div className="container py-16 flex justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data?.store) {
    return (
      <div className="container max-w-lg py-16 px-4 text-center">
        <Card>
          <CardHeader>
            <CardTitle>Tienda no disponible</CardTitle>
            <CardDescription>
              {(error as Error | undefined)?.message ?? "No encontramos esta tienda."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" asChild>
              <Link href="/tienda">Volver</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { store, isOwner } = data;
  const canManageStore = isOwner || isAdmin;
  /** Misma vitrina para todos; el lateral es carrito (cliente) o configuración (admin/dueño). */
  const showSidePanel = true;
  const showCustomerCart = !canManageStore;
  const cartActionsEnabled = showCustomerCart && isAuthenticated;

  const addToCartBusyKey =
    addToCartMutation.isPending && addToCartMutation.variables
      ? addToCartMutation.variables.kind === "product"
        ? showcaseCartItemKey("product", addToCartMutation.variables.productId!)
        : showcaseCartItemKey("promotion", addToCartMutation.variables.promotionId!)
      : null;

  async function handleAddProductToCart(productId: number) {
    try {
      await addToCartMutation.mutateAsync({ kind: "product", productId, quantity: 1 });
      toast({ title: "Añadido al carrito" });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "No se pudo añadir",
        description: e instanceof Error ? e.message : "Error desconocido",
      });
    }
  }

  async function handleAddPromotionToCart(promotionId: number) {
    try {
      await addToCartMutation.mutateAsync({ kind: "promotion", promotionId, quantity: 1 });
      toast({ title: "Promoción añadida al carrito" });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "No se pudo añadir",
        description: e instanceof Error ? e.message : "Error desconocido",
      });
    }
  }

  return (
    <div className="flex w-full flex-1 min-h-0 overflow-hidden bg-muted/20">
      <div className="flex-1 min-w-0 overflow-y-auto px-4 py-8 sm:px-6 lg:px-10 space-y-6">
        {store.coverImageUrl ? (
          <div className="relative mx-auto aspect-[21/9] max-h-56 w-full max-w-2xl overflow-hidden rounded-xl border border-border bg-muted/30">
            <img src={store.coverImageUrl} alt="" className="h-full w-full object-cover" />
          </div>
        ) : null}

        <section className="space-y-4">
          {!showcaseLoading && hasShowcaseFilters ? (
            <StoreShowcaseFilters
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              categoryFilter={categoryFilter}
              onCategoryChange={setCategoryFilter}
              categories={showcaseCategories}
              showPromotionsFilter={showcasePromotions.length > 0}
            />
          ) : null}
          {showingPromotions ? (
            <StoreShowcasePromotionGrid
              largeCards
              centered={false}
              promotions={filteredShowcasePromotions}
              isLoading={showcaseLoading}
              error={showcaseError as Error | null}
              onAddPromotionToCart={cartActionsEnabled ? handleAddPromotionToCart : undefined}
              addToCartBusyKey={addToCartBusyKey}
              emptyMessage={
                showcasePromotions.length === 0
                  ? "Esta tienda no tiene promociones activas."
                  : "No hay promociones que coincidan con tu búsqueda."
              }
            />
          ) : (
            <StoreShowcaseProductGrid
              largeCards
              centered={false}
              products={filteredShowcaseProducts}
              isLoading={showcaseLoading}
              error={showcaseError as Error | null}
              onAddProductToCart={cartActionsEnabled ? handleAddProductToCart : undefined}
              addToCartBusyKey={addToCartBusyKey}
              emptyMessage={
                showcaseProducts.length === 0
                  ? canManageStore
                    ? "Activa «En vitrina» en tus productos desde el panel para mostrarlos aquí."
                    : "no hay articulos aún"
                  : "No hay productos que coincidan con tu búsqueda o categoría."
              }
            />
          )}
        </section>

        {!isAuthenticated && (
          <p className="text-sm text-muted-foreground text-center">
            <Link href="/login" className="text-primary underline">
              Inicia sesión
            </Link>{" "}
            para comprar en la tienda.
          </p>
        )}
      </div>

      {showSidePanel ? (
        <div className="shrink-0 flex min-h-0 self-stretch p-3 pr-4 pb-4 pt-3">
          {showCustomerCart ? (
            <StoreCartPanel storeId={store.id} storeName={store.name} enabled />
          ) : (
            <StoreAdminSidePanel store={store} />
          )}
        </div>
      ) : null}
    </div>
  );
}
