import { useEffect, useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import { AlertCircle, Clock, Loader2, Settings, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
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
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

type StorePayload = {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
  rubroLabel?: string | null;
  coverImageUrl?: string | null;
  visibilityActive: boolean;
  hasPendingSubscriptionPayment?: boolean;
};

function StoreOwnerSettingsButton({
  store,
  visibilityActive,
}: {
  store: StorePayload;
  visibilityActive: boolean;
}) {
  const settingsEnabled = visibilityActive;
  const tooltipText = !visibilityActive
    ? "Activa tu tienda con el pago de mensualidad"
    : store.hasPendingSubscriptionPayment
      ? "Comprobante en revisión — espera la validación del equipo"
      : "Configuración de tienda";

  const button = (
    <Button
      variant="outline"
      size="icon"
      className={cn("rounded-full shadow-md", !settingsEnabled && "opacity-70 cursor-not-allowed")}
      disabled={!settingsEnabled}
      aria-label="Configuración de tienda"
    >
      <Settings className="h-5 w-5" />
    </Button>
  );

  if (settingsEnabled) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="icon" className="rounded-full shadow-md" asChild>
            <Link href={`/tienda/${encodeURIComponent(store.slug)}/admin/configuracion`} aria-label="Configuración de tienda">
              <Settings className="h-5 w-5" />
            </Link>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">{tooltipText}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {button}
        </span>
      </TooltipTrigger>
      <TooltipContent side="left" className="max-w-[220px]">
        {tooltipText}
      </TooltipContent>
    </Tooltip>
  );
}

function StoreInactivePublicView({ storeName }: { storeName?: string }) {
  return (
    <div className="container max-w-lg py-16 px-4">
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <Store className="h-7 w-7 text-muted-foreground" />
          </div>
          {storeName ? <CardTitle className="text-xl">{storeName}</CardTitle> : null}
          <CardDescription className="text-base text-foreground/90 pt-1">
            Tienda inactiva por el momento.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-sm text-muted-foreground">
            Esta tienda no está visible en el catálogo hasta que el dueño renueve la mensualidad.
          </p>
          <Button variant="outline" asChild>
            <Link href="/tiendas">Ver tiendas activas</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function StorePage() {
  const [, params] = useRoute("/tienda/:slug");
  const slug = params?.slug ?? "";
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [paymentSentDialogOpen, setPaymentSentDialogOpen] = useState(false);
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
    if (!slug || typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    if (p.get("pago") === "enviado") {
      setPaymentSentDialogOpen(true);
      window.history.replaceState({}, "", `/tienda/${encodeURIComponent(slug)}`);
    }
  }, [slug]);

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
              <Link href="/tiendas">Explorar tiendas</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { store, isOwner, visibilityActive, inactive } = data;

  if (inactive && !isOwner) {
    return <StoreInactivePublicView storeName={store.name} />;
  }

  const showActivationBanner = isOwner && !visibilityActive;
  const paymentHref = `/tienda/${encodeURIComponent(store.slug)}/pago`;
  const ownerPreview = isOwner && !visibilityActive;
  const showCustomerCart = !isOwner && visibilityActive;
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
    <TooltipProvider delayDuration={200}>
      <div
        className={cn(
          "w-full",
          showCustomerCart ? "flex flex-1 min-h-0 overflow-hidden bg-muted/20" : "relative min-h-[50vh]",
        )}
      >
        {isOwner && !showCustomerCart ? (
          <div className="absolute top-4 right-4 z-10">
            <StoreOwnerSettingsButton store={store} visibilityActive={visibilityActive} />
          </div>
        ) : null}
        <div
          className={cn(
            showCustomerCart
              ? "flex-1 min-w-0 overflow-y-auto px-4 py-8 sm:px-6 lg:px-10 space-y-6"
              : "mx-auto container max-w-3xl px-4 py-10 space-y-6",
          )}
        >
          {store.coverImageUrl ? (
            <div className="relative mx-auto aspect-[21/9] max-h-56 w-full max-w-2xl overflow-hidden rounded-xl border border-border bg-muted/30">
              <img src={store.coverImageUrl} alt="" className="h-full w-full object-cover" />
            </div>
          ) : null}

          {showActivationBanner && (
            <Link
              href={store.hasPendingSubscriptionPayment ? "#" : paymentHref}
              className={cn(
                "block w-full rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-left transition-colors",
                !store.hasPendingSubscriptionPayment && "hover:bg-amber-500/15",
                store.hasPendingSubscriptionPayment && "cursor-default opacity-90",
              )}
              onClick={(e) => {
                if (store.hasPendingSubscriptionPayment) e.preventDefault();
              }}
            >
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-foreground">Activa tu tienda haciendo el pago correspondiente</p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {store.hasPendingSubscriptionPayment
                      ? "Tu comprobante está en revisión. Te notificaremos cuando se valide."
                      : "Toca aquí para registrar la transferencia y activar la visibilidad en el catálogo."}
                  </p>
                </div>
              </div>
            </Link>
          )}

          <header className={cn("space-y-2 px-2", showCustomerCart ? "text-left sm:px-0" : "text-center sm:px-12")}>
            <h1 className="text-2xl font-bold tracking-tight">{store.name}</h1>
            {store.rubroLabel ? (
              <div className={cn(showCustomerCart ? "" : "flex justify-center")}>
                <Badge variant="secondary">{store.rubroLabel}</Badge>
              </div>
            ) : null}
            {store.description?.trim() ? (
              <p className="text-sm text-muted-foreground max-w-xl mx-auto">{store.description.trim()}</p>
            ) : null}
            <p className="text-sm text-muted-foreground">
              {visibilityActive
                ? showcaseProducts.length > 0
                  ? `${showcaseProducts.length} producto${showcaseProducts.length === 1 ? "" : "s"} en vitrina`
                  : "Tienda activa — aún no hay productos visibles en vitrina."
                : isOwner
                  ? "Vista previa: solo tú ves estos productos hasta activar la mensualidad."
                  : "Tienda inactiva por el momento."}
            </p>
          </header>

          {ownerPreview && showcaseProducts.length > 0 ? (
            <p className="text-xs text-amber-700 dark:text-amber-400 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
              Los visitantes no verán la vitrina hasta que actives la tienda. Los productos con «En vitrina»
              activado aparecerán aquí cuando la mensualidad esté vigente.
            </p>
          ) : null}

          {(visibilityActive || ownerPreview) && (
            <section className="space-y-4">
              <h2 className={cn("text-lg font-semibold", showCustomerCart ? "text-left" : "text-center")}>
                {showingPromotions ? "Promociones" : "Productos"}
              </h2>
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
                  largeCards={showCustomerCart}
                  centered={!showCustomerCart}
                  products={filteredShowcaseProducts}
                  isLoading={showcaseLoading}
                  error={showcaseError as Error | null}
                  onAddProductToCart={cartActionsEnabled ? handleAddProductToCart : undefined}
                  addToCartBusyKey={addToCartBusyKey}
                  emptyMessage={
                    showcaseProducts.length === 0
                      ? isOwner
                        ? "Activa «En vitrina» en tus productos desde el panel para mostrarlos aquí."
                        : "Esta tienda aún no tiene productos disponibles."
                      : "No hay productos que coincidan con tu búsqueda o categoría."
                  }
                />
              )}
            </section>
          )}

          {!isAuthenticated && (
            <p className="text-sm text-muted-foreground text-center">
              <Link href="/login" className="text-primary underline">
                Inicia sesión
              </Link>{" "}
              para gestionar tu tienda.
            </p>
          )}
        </div>

        {showCustomerCart ? (
          <div className="shrink-0 flex min-h-0 self-stretch p-3 pr-4 pb-4 pt-3">
            <StoreCartPanel storeId={store.id} storeName={store.name} enabled />
          </div>
        ) : null}
      </div>

      <Dialog open={paymentSentDialogOpen} onOpenChange={setPaymentSentDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15">
              <Clock className="h-6 w-6 text-amber-600" />
            </div>
            <DialogTitle className="text-center">Comprobante enviado</DialogTitle>
            <DialogDescription className="text-center">
              Tu comprobante de pago fue registrado y está en revisión. Te notificaremos cuando el equipo lo valide.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-center">
            <Button onClick={() => setPaymentSentDialogOpen(false)}>Entendido</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
