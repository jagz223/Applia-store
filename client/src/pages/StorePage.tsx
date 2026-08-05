import { useEffect, useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import { ChevronDown, ChevronRight, ChevronUp, Loader2, Settings, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { hasAdminRole } from "@/lib/auth-utils";
import { useStoreBySlug } from "@/hooks/use-my-store";
import {
  useStoreShowcaseProducts,
  type StoreShowcaseProduct,
} from "@/hooks/use-store-showcase";
import { useAddToStoreCart, useStoreCart } from "@/hooks/use-store-cart";
import { StoreShowcaseProductGrid } from "@/components/store/StoreShowcaseProductGrid";
import { StoreShowcasePromotionGrid } from "@/components/store/StoreShowcasePromotionGrid";
import { StoreCartPanel, storeCartPanelWidthClass } from "@/components/store/StoreCartPanel";
import {
  StoreProductCustomizePanel,
  type ProductCustomizeSelection,
} from "@/components/store/StoreProductCustomizePanel";
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
    <div className="flex h-0 min-h-0 w-full flex-1 flex-col overflow-hidden rounded-[1.25rem] border border-border/60 bg-white shadow-sm dark:bg-card">
      <div className="shrink-0 border-b border-border/60 px-4 py-3">
        <p className="text-sm font-semibold text-foreground">Administración</p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        <Link
          href={`/tienda/${encodeURIComponent(store.slug)}/admin/configuracion`}
          className="group block"
        >
          <div
            className={cn(
              "flex items-center gap-3 rounded-2xl border border-border p-4",
              "bg-muted/30 transition-colors hover:bg-muted/50",
            )}
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-foreground text-background">
              <Settings className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-foreground">Configuración de la tienda</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Productos, categorías, órdenes y datos
              </p>
            </div>
            <ChevronRight
              className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
          </div>
        </Link>
        <Button variant="outline" className="w-full justify-start gap-2 rounded-full" asChild>
          <Link href={`/tienda/${encodeURIComponent(store.slug)}/admin/productos`}>
            <Settings className="h-4 w-4" aria-hidden />
            Ir al panel de productos
          </Link>
        </Button>
      </div>
    </div>
  );
}

function formatCartBarTotal(value: number) {
  return new Intl.NumberFormat("es-VE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export default function StorePage() {
  const [, params] = useRoute("/tienda/:slug");
  const slug = params?.slug ?? "";
  const { user, isAuthenticated } = useAuth();
  const isAdmin = hasAdminRole(user);
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<ShowcaseCategoryFilter>("all");
  const [selectedProduct, setSelectedProduct] = useState<StoreShowcaseProduct | null>(null);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [isLgUp, setIsLgUp] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches,
  );

  const { data, isLoading, error } = useStoreBySlug(slug, Boolean(slug));
  const storeId = data?.store?.id ?? 0;
  const addToCartMutation = useAddToStoreCart(storeId);
  const canManageStorePreview = Boolean(data?.isOwner) || isAdmin;
  const { data: mobileCart } = useStoreCart(
    storeId,
    Boolean(storeId) && isAuthenticated && !canManageStorePreview,
  );
  const canLoadShowcase = Boolean(slug) && !isLoading && Boolean(data?.store);
  const {
    data: showcaseData,
    isLoading: showcaseLoading,
    error: showcaseError,
  } = useStoreShowcaseProducts(slug, canLoadShowcase);

  useEffect(() => {
    setSearchQuery("");
    setCategoryFilter("all");
    setSelectedProduct(null);
    setMobilePanelOpen(false);
  }, [slug]);

  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setIsLgUp(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

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
  const showSidePanel = true;
  const showCustomerCart = !canManageStore;
  const cartActionsEnabled = showCustomerCart && isAuthenticated;
  const customizing = showCustomerCart && selectedProduct != null;

  const addToCartBusyKey =
    addToCartMutation.isPending && addToCartMutation.variables
      ? addToCartMutation.variables.kind === "product"
        ? showcaseCartItemKey("product", addToCartMutation.variables.productId!)
        : showcaseCartItemKey("promotion", addToCartMutation.variables.promotionId!)
      : null;

  async function handleAddPromotionToCart(promotionId: number) {
    try {
      await addToCartMutation.mutateAsync({ kind: "promotion", promotionId, quantity: 1 });
      toast({ title: "Promoción añadida al carrito" });
      setMobilePanelOpen(true);
    } catch (e) {
      toast({
        variant: "destructive",
        title: "No se pudo añadir",
        description: e instanceof Error ? e.message : "Error desconocido",
      });
    }
  }

  function handleSelectProduct(product: StoreShowcaseProduct) {
    if (!showCustomerCart) return;
    setSelectedProduct(product);
    setMobilePanelOpen(true);
  }

  async function handleConfirmCustomize(selection: ProductCustomizeSelection) {
    if (!cartActionsEnabled) {
      toast({
        variant: "destructive",
        title: "Inicia sesión",
        description: "Debes iniciar sesión para comprar.",
      });
      return;
    }
    try {
      await addToCartMutation.mutateAsync({
        kind: "product",
        productId: selection.productId,
        quantity: selection.quantity,
        removedIngredientMaterialIds: selection.removedIngredientMaterialIds,
        additionalIngredientMaterialIds: selection.additionalIngredientMaterialIds,
      });
      toast({ title: "Añadido al carrito", description: selection.displayName });
      setSelectedProduct(null);
      setMobilePanelOpen(true);
    } catch (e) {
      toast({
        variant: "destructive",
        title: "No se pudo añadir",
        description: e instanceof Error ? e.message : "Error desconocido",
      });
    }
  }

  function renderSidePanelContent() {
    if (showCustomerCart) {
      if (customizing && selectedProduct) {
        return (
          <StoreProductCustomizePanel
            key={selectedProduct.id}
            product={selectedProduct}
            onClose={() => setSelectedProduct(null)}
            onConfirm={handleConfirmCustomize}
            confirming={addToCartMutation.isPending}
            canAddToCart={cartActionsEnabled}
          />
        );
      }
      return <StoreCartPanel storeId={store.id} storeName={store.name} enabled />;
    }
    return <StoreAdminSidePanel store={store} />;
  }

  const mobileBarTitle = showCustomerCart
    ? customizing
      ? "Personalizar"
      : "Mi pedido"
    : "Administración";
  const mobileCartCount = mobileCart?.itemCount ?? 0;
  const mobileCartTotal = mobileCart?.subtotal ?? 0;

  return (
    <div className="relative flex h-0 min-h-0 w-full flex-1 overflow-hidden bg-background">
      <div
        className={cn(
          "min-h-0 flex-1 min-w-0 overflow-y-auto overscroll-contain",
          "px-3 py-4 sm:px-6 sm:py-6 lg:px-8",
          "space-y-4 sm:space-y-5",
          showSidePanel && !isLgUp ? "pb-[5.5rem]" : "pb-6",
        )}
      >
        {store.coverImageUrl ? (
          <div className="relative mx-auto aspect-[21/9] max-h-36 sm:max-h-48 w-full max-w-3xl overflow-hidden rounded-2xl sm:rounded-[1.25rem] bg-muted/40 shadow-sm">
            <img src={store.coverImageUrl} alt="" className="h-full w-full object-cover" />
          </div>
        ) : null}

        <section className="space-y-3 sm:space-y-4">
          {!showcaseLoading && hasShowcaseFilters ? (
            <StoreShowcaseFilters
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              categoryFilter={categoryFilter}
              onCategoryChange={(next) => {
                setCategoryFilter(next);
                setSelectedProduct(null);
              }}
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
              selectedProductId={selectedProduct?.id ?? null}
              onSelectProduct={showCustomerCart ? handleSelectProduct : undefined}
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

        {!isAuthenticated && showCustomerCart ? (
          <p className="text-sm text-muted-foreground text-center">
            <Link href="/login" className="text-foreground underline underline-offset-2">
              Inicia sesión
            </Link>{" "}
            para comprar en la tienda.
          </p>
        ) : null}
      </div>

      {showSidePanel && isLgUp ? (
        <aside
          className={cn(
            "flex min-h-0 w-full shrink-0 flex-col self-stretch overflow-hidden p-3 pr-4 pb-4 pt-3",
            storeCartPanelWidthClass,
          )}
        >
          {renderSidePanelContent()}
        </aside>
      ) : null}

      {showSidePanel && !isLgUp ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40">
          {mobilePanelOpen ? (
            <div
              className="pointer-events-auto flex h-[min(78dvh,36rem)] flex-col overflow-hidden rounded-t-2xl border border-border/70 bg-background shadow-[0_-8px_30px_rgba(0,0,0,0.12)]"
              role="dialog"
              aria-label={mobileBarTitle}
            >
              <button
                type="button"
                className="flex shrink-0 items-center justify-between gap-3 border-b border-border/60 px-4 py-3 text-left"
                onClick={() => {
                  setMobilePanelOpen(false);
                  if (customizing) setSelectedProduct(null);
                }}
              >
                <span className="flex min-w-0 items-center gap-2">
                  {showCustomerCart ? (
                    <ShoppingBag className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                  ) : (
                    <Settings className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                  )}
                  <span className="truncate font-semibold">{mobileBarTitle}</span>
                  {showCustomerCart && !customizing && mobileCartCount > 0 ? (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground">
                      {mobileCartCount}
                    </span>
                  ) : null}
                </span>
                <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
              </button>
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3 pt-2">
                {renderSidePanelContent()}
              </div>
            </div>
          ) : (
            <div className="pointer-events-auto border-t border-border/70 bg-background/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-md">
              <button
                type="button"
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-2xl border border-border/80 bg-white px-4 py-3 shadow-sm",
                  "dark:bg-card",
                )}
                onClick={() => setMobilePanelOpen(true)}
                aria-expanded={false}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  {showCustomerCart ? (
                    <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
                      <ShoppingBag className="h-5 w-5" aria-hidden />
                      {mobileCartCount > 0 ? (
                        <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                          {mobileCartCount}
                        </span>
                      ) : null}
                    </span>
                  ) : (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
                      <Settings className="h-5 w-5" aria-hidden />
                    </span>
                  )}
                  <span className="min-w-0 text-left">
                    <span className="block truncate text-sm font-semibold leading-tight">
                      {mobileBarTitle}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {showCustomerCart
                        ? mobileCartCount > 0
                          ? `${mobileCartCount} en el carrito · ${formatCartBarTotal(mobileCartTotal)}`
                          : "Toca para ver tu pedido"
                        : "Configuración y productos"}
                    </span>
                  </span>
                </span>
                <ChevronUp className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
