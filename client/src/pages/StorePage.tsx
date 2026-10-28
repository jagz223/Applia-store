import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useRoute, useSearch } from "wouter";
import { ChevronDown, ChevronRight, ChevronUp, Loader2, Settings, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { hasAdminRole } from "@/lib/auth-utils";
import { useStoreBySlug } from "@/hooks/use-my-store";
import {
  useStoreShowcaseMeta,
  useStoreShowcaseProduct,
  useStoreShowcaseProducts,
  STORE_SHOWCASE_PAGE_SIZE,
  type StoreShowcaseProduct,
  type StoreShowcasePromotion,
} from "@/hooks/use-store-showcase";
import { useAddToStoreCart, useStoreCart } from "@/hooks/use-store-cart";
import {
  StoreShowcaseProductGrid,
  StoreShowcaseProductGridSkeleton,
} from "@/components/store/StoreShowcaseProductGrid";
import { StoreShowcasePromotionGrid } from "@/components/store/StoreShowcasePromotionGrid";
import { StoreCartPanel, storeCartPanelWidthClass } from "@/components/store/StoreCartPanel";
import {
  StoreProductCustomizePanel,
  type ProductCustomizeSelection,
} from "@/components/store/StoreProductCustomizePanel";
import {
  StorePromotionDetailPanel,
  type PromotionDetailSelection,
} from "@/components/store/StorePromotionDetailPanel";
import { showcaseCartItemKey } from "@/components/store/StoreShowcaseAddToCartButton";
import {
  StoreShowcaseFilters,
  StoreShowcaseFiltersSkeleton,
  type ShowcaseCategoryFilter,
} from "@/components/store/StoreShowcaseFilters";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { StoreShowcaseBannersCarousel } from "@/components/store/StoreShowcaseBannersCarousel";
import { StoreShowcasePopupsModal } from "@/components/store/StoreShowcasePopupsModal";
import { StoreContactChannels } from "@/components/store/StoreContactChannels";
import { bannerVisibleForShowcaseCategoryFilter } from "@shared/store-showcase-ads-schema";

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

function normalizeShowcaseCategoryName(value: string): string {
  return value.trim().toLowerCase();
}

function readShowcaseCategoryQueryName(searchQs: string): string {
  return new URLSearchParams(searchQs || "").get("category")?.trim() ?? "";
}

function buildStoreShowcasePath(
  slug: string,
  searchQs: string,
  categoryName: string | null,
  catalogKind: "retail" | "import" = "retail",
): string {
  const params = new URLSearchParams(searchQs || "");
  if (categoryName && categoryName.trim()) {
    params.set("category", categoryName.trim());
  } else {
    params.delete("category");
  }
  const qs = params.toString();
  const base =
    catalogKind === "import"
      ? `/tienda/${encodeURIComponent(slug)}/para-importar`
      : `/tienda/${encodeURIComponent(slug)}`;
  return `${base}${qs ? `?${qs}` : ""}`;
}

export default function StorePage() {
  const [matchImport, importParams] = useRoute("/tienda/:slug/para-importar");
  const [, retailParams] = useRoute("/tienda/:slug");
  const searchQs = useSearch();
  const [, setLocation] = useLocation();
  const slug = (matchImport ? importParams?.slug : retailParams?.slug) ?? "";
  const catalogKind = matchImport ? "import" : "retail";
  const { user, isAuthenticated } = useAuth();
  const isAdmin = hasAdminRole(user);
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<ShowcaseCategoryFilter>("all");
  const [subcategoryFilter, setSubcategoryFilter] = useState<number | null>(null);
  const [productPage, setProductPage] = useState(1);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [selectedPromotion, setSelectedPromotion] = useState<StoreShowcasePromotion | null>(null);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [isLgUp, setIsLgUp] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches,
  );
  const appliedCategoryQueryRef = useRef<string>("");

  const { data, isLoading, error } = useStoreBySlug(slug, Boolean(slug));
  const storeId = data?.store?.id ?? 0;
  const addToCartMutation = useAddToStoreCart(storeId, catalogKind);
  const canManageStorePreview = Boolean(data?.isOwner) || isAdmin;
  const { data: mobileCart } = useStoreCart(
    storeId,
    Boolean(storeId) && isAuthenticated && !canManageStorePreview,
    catalogKind,
  );

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
      setProductPage(1);
    }, 250);
    return () => window.clearTimeout(t);
  }, [searchQuery]);

  const showingPromotions = catalogKind !== "import" && categoryFilter === "promotions";
  const showcaseCategoryId = typeof categoryFilter === "number" ? categoryFilter : null;
  const {
    data: showcaseMeta,
    isLoading: showcaseMetaLoading,
    error: showcaseMetaError,
  } = useStoreShowcaseMeta(slug, Boolean(slug), catalogKind);
  const {
    data: showcaseProductsData,
    isLoading: showcaseProductsLoading,
    isFetching: showcaseFetching,
    error: showcaseProductsError,
  } = useStoreShowcaseProducts(slug, Boolean(slug), {
    page: productPage,
    limit: STORE_SHOWCASE_PAGE_SIZE,
    search: showingPromotions ? "" : debouncedSearch,
    categoryId: showcaseCategoryId,
    subcategoryId: subcategoryFilter,
    catalogKind,
  });
  const showcaseFiltersLoading = showcaseMetaLoading;
  /** No esperar meta: los productos ya vienen paginados del servidor. */
  const showcaseGridLoading = showcaseProductsLoading && !showcaseProductsData;
  const showcaseError = showcaseProductsError ?? showcaseMetaError;

  const {
    data: selectedProduct,
    isLoading: selectedProductLoading,
    error: selectedProductError,
  } = useStoreShowcaseProduct(slug, selectedProductId, catalogKind);

  useEffect(() => {
    if (!selectedProductError) return;
    toast({
      variant: "destructive",
      title: "No se pudo abrir el producto",
      description: selectedProductError.message,
    });
    setSelectedProductId(null);
  }, [selectedProductError, toast]);

  const banners = useMemo(() => {
    const all = showcaseMeta?.banners ?? [];
    return all.filter((b) => bannerVisibleForShowcaseCategoryFilter(b, categoryFilter));
  }, [showcaseMeta?.banners, categoryFilter]);
  const popups = showcaseMeta?.popups ?? [];
  const [popupsOpen, setPopupsOpen] = useState(false);

  useEffect(() => {
    setSearchQuery("");
    setDebouncedSearch("");
    setCategoryFilter("all");
    setSubcategoryFilter(null);
    setProductPage(1);
    setSelectedProductId(null);
    setSelectedPromotion(null);
    setMobilePanelOpen(false);
    setPopupsOpen(false);
    appliedCategoryQueryRef.current = "";
  }, [slug]);

  useEffect(() => {
    const pago = new URLSearchParams(searchQs || "").get("pago")?.trim().toLowerCase();
    if (pago === "cancelado") {
      toast({
        variant: "destructive",
        title: "Pago no completado",
        description: "No se creó el pedido. Puedes intentar de nuevo desde el carrito.",
      });
    }
  }, [searchQs, toast]);

  useEffect(() => {
    const categoryName = readShowcaseCategoryQueryName(searchQs);
    if (!categoryName) {
      appliedCategoryQueryRef.current = "";
      return;
    }
    const categories = showcaseMeta?.categories;
    if (!categories?.length) return;
    const normalized = normalizeShowcaseCategoryName(categoryName);
    if (appliedCategoryQueryRef.current === normalized) return;
    const match = categories.find(
      (category) => normalizeShowcaseCategoryName(category.name) === normalized,
    );
    if (!match) return;
    appliedCategoryQueryRef.current = normalized;
    setCategoryFilter(match.id);
    setSubcategoryFilter(null);
    setProductPage(1);
  }, [searchQs, showcaseMeta?.categories]);

  // Pop-ups: aparecen en el cliente si no ha ingresado a la vitrina en al menos 1 hora.
  useEffect(() => {
    if (!slug) return;
    if (canManageStorePreview) return;
    if (showcaseFiltersLoading) return;
    if (popups.length === 0) return;

    const key = `applia_store_last_enter_${encodeURIComponent(slug)}`;
    const last = Number(localStorage.getItem(key) ?? "0");
    const now = Date.now();
    const shouldShow = now - last >= 60 * 60 * 1000;
    localStorage.setItem(key, String(now));
    if (shouldShow) setPopupsOpen(true);
  }, [slug, canManageStorePreview, showcaseFiltersLoading, popups.length]);

  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setIsLgUp(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const showcaseProducts = showcaseProductsData?.products ?? [];
  const showcaseCategories = showcaseMeta?.categories ?? [];
  const showcaseSubcategories = showcaseMeta?.subcategories ?? [];
  const showcasePromotions = showcaseMeta?.promotions ?? [];
  const catalogTotal = showcaseMeta?.catalogTotal ?? showcaseProductsData?.catalogTotal ?? 0;
  const productTotalPages = showcaseProductsData?.totalPages ?? 1;
  const hasShowcaseFilters =
    catalogTotal > 0 ||
    showcaseCategories.length > 0 ||
    showcasePromotions.length > 0;

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

  if (isLoading && !data?.store) {
    return (
      <div className="relative flex h-0 min-h-0 w-full flex-1 overflow-hidden bg-background">
        <div
          className={cn(
            "min-h-0 flex-1 min-w-0 overflow-y-auto overscroll-contain",
            "px-3 py-4 sm:px-6 sm:py-6 lg:px-8",
            "space-y-4 sm:space-y-5 pb-6",
          )}
        >
          <section className="space-y-3 sm:space-y-4">
            <StoreShowcaseFiltersSkeleton />
            <StoreShowcaseProductGridSkeleton largeCards count={6} />
          </section>
        </div>
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
  const cartActionsEnabled = showCustomerCart;
  const customizing = showCustomerCart && selectedProductId != null;
  const viewingPromotion = showCustomerCart && selectedPromotion != null;
  const detailing = customizing || viewingPromotion;

  const addToCartBusyKey =
    addToCartMutation.isPending && addToCartMutation.variables
      ? addToCartMutation.variables.kind === "product"
        ? showcaseCartItemKey("product", addToCartMutation.variables.productId!)
        : showcaseCartItemKey("promotion", addToCartMutation.variables.promotionId!)
      : null;

  function handleSelectProduct(product: StoreShowcaseProduct) {
    if (!showCustomerCart) return;
    setSelectedPromotion(null);
    setSelectedProductId(product.id);
    setMobilePanelOpen(true);
  }

  function handleSelectPromotion(promotion: StoreShowcasePromotion) {
    if (!showCustomerCart) return;
    setSelectedProductId(null);
    setSelectedPromotion(promotion);
    setMobilePanelOpen(true);
  }

  async function handleConfirmCustomize(selection: ProductCustomizeSelection) {
    if (!cartActionsEnabled || !storeId) return;
    try {
      if (isAuthenticated) {
        await addToCartMutation.mutateAsync({
          kind: "product",
          productId: selection.productId,
          quantity: selection.quantity,
          sizeId: selection.sizeId,
          removedIngredientMaterialIds: selection.removedIngredientMaterialIds,
          additionalIngredientMaterialIds: selection.additionalIngredientMaterialIds,
        });
      } else {
        const { addGuestStoreCartItem } = await import("@/lib/guest-store-cart");
        addGuestStoreCartItem(
          storeId,
          {
            kind: "product",
            productId: selection.productId,
            quantity: selection.quantity,
            sizeId: selection.sizeId,
            removedIngredientMaterialIds: selection.removedIngredientMaterialIds,
            additionalIngredientMaterialIds: selection.additionalIngredientMaterialIds,
            name: selection.displayName,
            price: selection.unitPrice ?? 0,
            boxSize: selectedProduct?.boxSize,
          },
          catalogKind,
        );
      }
      toast({ title: "Añadido al carrito", description: selection.displayName });
      setSelectedProductId(null);
      setMobilePanelOpen(true);
    } catch (e) {
      toast({
        variant: "destructive",
        title: "No se pudo añadir",
        description: e instanceof Error ? e.message : "Error desconocido",
      });
    }
  }

  async function handleConfirmPromotion(selection: PromotionDetailSelection) {
    if (!cartActionsEnabled || !storeId) return;
    try {
      if (isAuthenticated) {
        await addToCartMutation.mutateAsync({
          kind: "promotion",
          promotionId: selection.promotionId,
          quantity: selection.quantity,
          removedIngredientMaterialIds: [],
          additionalIngredientMaterialIds: [],
        });
      } else {
        const { addGuestStoreCartItem } = await import("@/lib/guest-store-cart");
        addGuestStoreCartItem(
          storeId,
          {
            kind: "promotion",
            promotionId: selection.promotionId,
            quantity: selection.quantity,
            name: selection.displayName,
            price: selection.unitPrice ?? 0,
          },
          catalogKind,
        );
      }
      toast({ title: "Promoción añadida al carrito", description: selection.displayName });
      setSelectedPromotion(null);
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
      if (customizing) {
        if (selectedProductLoading || !selectedProduct) {
          return (
            <div className="flex h-full min-h-[12rem] items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          );
        }
        return (
          <StoreProductCustomizePanel
            key={`product-${selectedProduct.id}`}
            product={selectedProduct}
            onClose={() => setSelectedProductId(null)}
            onConfirm={handleConfirmCustomize}
            confirming={addToCartMutation.isPending}
            canAddToCart={cartActionsEnabled}
          />
        );
      }
      if (viewingPromotion && selectedPromotion) {
        return (
          <StorePromotionDetailPanel
            key={`promotion-${selectedPromotion.id}`}
            promotion={selectedPromotion}
            onClose={() => setSelectedPromotion(null)}
            onConfirm={handleConfirmPromotion}
            confirming={addToCartMutation.isPending}
            canAddToCart={cartActionsEnabled}
          />
        );
      }
      return (
        <StoreCartPanel
          storeId={store.id}
          storeName={store.name}
          enabled
          cartKind={catalogKind}
        />
      );
    }
    return <StoreAdminSidePanel store={store} />;
  }

  const mobileBarTitle = showCustomerCart
    ? customizing
      ? "Personalizar"
      : viewingPromotion
        ? "Promoción"
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
          {!showcaseFiltersLoading && hasShowcaseFilters && banners.length > 0 ? (
            <StoreShowcaseBannersCarousel banners={banners} />
          ) : null}

          {showcaseFiltersLoading ? (
            <StoreShowcaseFiltersSkeleton />
          ) : hasShowcaseFilters ? (
            <StoreShowcaseFilters
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              categoryFilter={categoryFilter}
              onCategoryChange={(next) => {
                setCategoryFilter(next);
                setSubcategoryFilter(null);
                setProductPage(1);
                setSelectedProductId(null);
                setSelectedPromotion(null);
                const categoryName =
                  typeof next === "number"
                    ? showcaseCategories.find((category) => category.id === next)?.name ?? null
                    : null;
                appliedCategoryQueryRef.current = categoryName
                  ? normalizeShowcaseCategoryName(categoryName)
                  : "";
                setLocation(
                  buildStoreShowcasePath(slug, searchQs, categoryName, catalogKind),
                  { replace: true },
                );
              }}
              subcategoryFilter={subcategoryFilter}
              onSubcategoryChange={(next) => {
                setSubcategoryFilter(next);
                setProductPage(1);
                setSelectedProductId(null);
                setSelectedPromotion(null);
              }}
              categories={showcaseCategories}
              subcategories={showcaseSubcategories}
              showPromotionsFilter={catalogKind !== "import" && showcasePromotions.length > 0}
            />
          ) : null}
          {showingPromotions ? (
            <StoreShowcasePromotionGrid
              largeCards
              centered={false}
              promotions={filteredShowcasePromotions}
              isLoading={showcaseFiltersLoading}
              error={showcaseError as Error | null}
              selectedPromotionId={selectedPromotion?.id ?? null}
              onSelectPromotion={showCustomerCart ? handleSelectPromotion : undefined}
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
              products={showcaseProducts}
              isLoading={showcaseGridLoading}
              isFetching={showcaseFetching}
              error={showcaseError as Error | null}
              selectedProductId={selectedProductId}
              onSelectProduct={showCustomerCart ? handleSelectProduct : undefined}
              addToCartBusyKey={addToCartBusyKey}
              page={productPage}
              totalPages={productTotalPages}
              onPageChange={setProductPage}
              emptyMessage={
                catalogTotal === 0
                  ? canManageStore
                    ? "Activa «En vitrina» en tus productos desde el panel para mostrarlos aquí."
                    : "no hay articulos aún"
                  : "No hay productos que coincidan con tu búsqueda o categoría."
              }
            />
          )}
        </section>

        {showCustomerCart ? (
          <section className="mx-auto max-w-3xl rounded-2xl border border-border/70 bg-card/95 p-4 sm:p-5 space-y-3">
            <div>
              <h2 className="font-display text-lg font-semibold">Comunícate con nosotros</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Servicio al cliente de {store.name}. Para un pedido concreto abre el chat dentro de
                tu orden en Mis pedidos.
              </p>
            </div>
            <StoreContactChannels
              whatsappUrl={data?.store?.whatsappUrl}
              whatsappDisplay={data?.store?.whatsappDisplay}
              onOpenChat={
                isAuthenticated ? () => window.location.assign("/pedidos-tienda") : undefined
              }
              showChat
              chatDisabled={!isAuthenticated}
              chatDisabledReason={
                !isAuthenticated
                  ? "Inicia sesión y abre un pedido activo para usar el chat."
                  : undefined
              }
            />
          </section>
        ) : null}

        {!isAuthenticated && showCustomerCart ? (
          <p className="text-sm text-muted-foreground text-center">
            <Link href="/login" className="text-foreground underline underline-offset-2">
              Inicia sesión
            </Link>{" "}
            para comprar en la tienda.
          </p>
        ) : null}
      </div>

      {showCustomerCart ? (
        <StoreShowcasePopupsModal open={popupsOpen} onOpenChange={setPopupsOpen} popups={popups} />
      ) : null}

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
                  if (customizing) setSelectedProductId(null);
                  if (viewingPromotion) setSelectedPromotion(null);
                }}
              >
                <span className="flex min-w-0 items-center gap-2">
                  {showCustomerCart ? (
                    <ShoppingBag className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                  ) : (
                    <Settings className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                  )}
                  <span className="truncate font-semibold">{mobileBarTitle}</span>
                  {showCustomerCart && !detailing && mobileCartCount > 0 ? (
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
