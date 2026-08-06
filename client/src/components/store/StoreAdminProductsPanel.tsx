import { useEffect, useState } from "react";
import { Eye, ImageIcon, Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import {
  useDeleteStoreProduct,
  useStoreProductsPage,
  useUpdateStoreProduct,
  type StoreProductSummary,
} from "@/hooks/use-store-products";
import { StoreProductFormDialog } from "@/components/store/StoreProductFormDialog";
import { StoreProductDetailDialog } from "@/components/store/StoreProductDetailDialog";
import {
  STORE_ADMIN_LIST_PAGE_SIZE,
  StoreAdminListPagination,
} from "@/components/store/StoreAdminListPagination";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { storeAdminFieldClass, storeAdminSectionCardClass } from "@/components/store/store-admin-ui";
import {
  STORE_CURRENCY_USD_ID,
  currencyLabelForId,
  type StoreCurrencyExtra,
} from "@shared/store-currency-schema";

function formatPrice(value: number, currencyLabel?: string) {
  const amount = new Intl.NumberFormat("es-VE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
  return currencyLabel ? `${amount} ${currencyLabel}` : amount;
}

function ProductThumbnail({ imageUrls }: { imageUrls: string[] }) {
  const url = imageUrls[0]?.trim();
  if (!url) {
    return (
      <div
        className="h-12 w-12 shrink-0 rounded-md border border-dashed border-border bg-muted/40 flex items-center justify-center text-muted-foreground"
        aria-hidden
      >
        <ImageIcon className="h-5 w-5" />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt=""
      className="h-12 w-12 shrink-0 rounded-md border border-border object-cover bg-muted/30"
    />
  );
}

function ShowcaseToggle({
  storeId,
  product,
}: {
  storeId: number;
  product: StoreProductSummary;
}) {
  const { toast } = useToast();
  const updateMutation = useUpdateStoreProduct(storeId);
  const [checked, setChecked] = useState(product.showOnShowcase !== false);
  const busy = updateMutation.isPending && updateMutation.variables?.productId === product.id;

  useEffect(() => {
    setChecked(product.showOnShowcase !== false);
  }, [product.id, product.showOnShowcase]);

  async function handleChange(next: boolean) {
    const prev = checked;
    setChecked(next);
    try {
      await updateMutation.mutateAsync({
        productId: product.id,
        body: { showOnShowcase: next },
      });
      toast({
        title: next ? "Visible en vitrina" : "Oculto en vitrina",
        description: next
          ? `«${product.name}» se mostrará en la tienda pública.`
          : `«${product.name}» ya no aparece en la vitrina.`,
      });
    } catch (e) {
      setChecked(prev);
      toast({
        variant: "destructive",
        title: "No se pudo actualizar",
        description: e instanceof Error ? e.message : "Error desconocido",
      });
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Switch
        id={`showcase-${product.id}`}
        checked={checked}
        disabled={busy}
        onCheckedChange={(v) => void handleChange(v)}
        aria-label={`Mostrar ${product.name} en vitrina`}
      />
      <Label
        htmlFor={`showcase-${product.id}`}
        className={cn("text-xs cursor-pointer whitespace-nowrap", busy && "opacity-60")}
      >
        {busy ? "Guardando…" : checked ? "En vitrina" : "Oculto"}
      </Label>
    </div>
  );
}

function ProductRowActions({
  onDetail,
  onEdit,
  onDelete,
}: {
  onDetail: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        aria-label="Ver detalle"
        onClick={onDetail}
      >
        <Eye className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        aria-label="Editar"
        onClick={onEdit}
      >
        <Pencil className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-destructive hover:text-destructive"
        aria-label="Eliminar"
        onClick={onDelete}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function StoreAdminProductsPanel({
  storeId,
  currencyAcceptedPaymentIds,
  currencyExtras,
  currencyVisualId,
}: {
  storeId: number;
  currencyAcceptedPaymentIds?: string[];
  currencyExtras?: StoreCurrencyExtra[];
  currencyVisualId?: string;
}) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(t);
  }, [search]);

  const { data, isLoading, error, isFetching } = useStoreProductsPage(
    storeId,
    page,
    STORE_ADMIN_LIST_PAGE_SIZE,
    true,
    debouncedSearch,
  );
  const products = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const deleteMutation = useDeleteStoreProduct(storeId);

  const acceptedIds =
    currencyAcceptedPaymentIds && currencyAcceptedPaymentIds.length > 0
      ? currencyAcceptedPaymentIds
      : [STORE_CURRENCY_USD_ID];
  const extras = currencyExtras ?? [];
  const visualId = currencyVisualId || STORE_CURRENCY_USD_ID;

  const [formOpen, setFormOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<StoreProductSummary | null>(null);
  const [detailProduct, setDetailProduct] = useState<StoreProductSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StoreProductSummary | null>(null);

  function openCreate() {
    setEditProduct(null);
    setFormOpen(true);
  }

  function openEdit(product: StoreProductSummary) {
    setEditProduct(product);
    setFormOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      toast({ title: "Producto eliminado", description: `«${deleteTarget.name}» fue eliminado.` });
      setDeleteTarget(null);
      if (products.length <= 1 && page > 1) setPage((p) => Math.max(1, p - 1));
    } catch (e) {
      toast({
        variant: "destructive",
        title: "No se pudo eliminar",
        description: e instanceof Error ? e.message : "Error desconocido",
      });
    }
  }

  return (
    <>
      <Card className={cn(storeAdminSectionCardClass, "overflow-hidden border-border/70 shadow-sm")}>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="font-display">Productos</CardTitle>
            <CardDescription>Administra el catálogo de tu tienda.</CardDescription>
          </div>
          <Button size="sm" className="h-10 shrink-0 gap-1.5 rounded-full" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Crear producto
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtrar por nombre…"
              className={cn(storeAdminFieldClass, "pl-9")}
              aria-label="Filtrar productos por nombre"
            />
          </div>

          {isLoading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <p className="text-sm text-destructive py-6 text-center">{(error as Error).message}</p>
          ) : products.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {debouncedSearch
                ? "No hay coincidencias con ese filtro."
                : "Aún no hay productos. Usa «Crear producto» para añadir el primero."}
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {total} resultado{total === 1 ? "" : "s"}
                {isFetching ? " · actualizando…" : ""}
              </p>

              <ul className="grid gap-3 md:hidden">
                {products.map((product) => (
                  <li
                    key={product.id}
                    className="rounded-2xl border border-border/70 bg-card/95 p-3.5 shadow-sm"
                  >
                    <div className="flex gap-3">
                      <ProductThumbnail imageUrls={product.imageUrls ?? []} />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{product.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {formatPrice(
                              product.price,
                              product.displayCurrencyLabel ??
                                currencyLabelForId(visualId, extras),
                            )}
                          </p>
                        </div>
                        <ShowcaseToggle storeId={storeId} product={product} />
                        <ProductRowActions
                          onDetail={() => setDetailProduct(product)}
                          onEdit={() => openEdit(product)}
                          onDelete={() => setDeleteTarget(product)}
                        />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="hidden rounded-2xl border border-border/70 overflow-hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[72px]">Foto</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead className="w-[120px]">Precio</TableHead>
                      <TableHead className="w-[140px]">Vitrina</TableHead>
                      <TableHead className="w-[140px] text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.map((product) => (
                      <TableRow key={product.id}>
                        <TableCell>
                          <ProductThumbnail imageUrls={product.imageUrls ?? []} />
                        </TableCell>
                        <TableCell className="font-medium">{product.name}</TableCell>
                        <TableCell>
                          {formatPrice(
                            product.price,
                            product.displayCurrencyLabel ??
                              currencyLabelForId(visualId, extras),
                          )}
                        </TableCell>
                        <TableCell>
                          <ShowcaseToggle storeId={storeId} product={product} />
                        </TableCell>
                        <TableCell className="text-right">
                          <ProductRowActions
                            onDetail={() => setDetailProduct(product)}
                            onEdit={() => openEdit(product)}
                            onDelete={() => setDeleteTarget(product)}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <StoreAdminListPagination
                page={page}
                totalPages={totalPages}
                isFetching={isFetching}
                onPageChange={setPage}
              />
            </>
          )}
        </CardContent>
      </Card>

      <StoreProductFormDialog
        storeId={storeId}
        open={formOpen}
        onOpenChange={setFormOpen}
        product={editProduct}
        acceptedPaymentIds={acceptedIds}
        currencyExtras={extras}
        visualCurrencyId={visualId}
      />

      <StoreProductDetailDialog
        storeId={storeId}
        product={detailProduct}
        open={detailProduct != null}
        onOpenChange={(o) => !o && setDetailProduct(null)}
      />

      <AlertDialog open={deleteTarget != null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar producto?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `«${deleteTarget.name}» se eliminará permanentemente del catálogo.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
            >
              {deleteMutation.isPending ? "Eliminando…" : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
