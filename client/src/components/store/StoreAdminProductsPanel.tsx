import { useEffect, useState } from "react";
import { Eye, ImageIcon, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import {
  useDeleteStoreProduct,
  useStoreProducts,
  useUpdateStoreProduct,
  type StoreProductSummary,
} from "@/hooks/use-store-products";
import { StoreProductFormDialog } from "@/components/store/StoreProductFormDialog";
import { StoreProductDetailDialog } from "@/components/store/StoreProductDetailDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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

function formatPrice(value: number) {
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(value);
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

export function StoreAdminProductsPanel({ storeId }: { storeId: number }) {
  const { toast } = useToast();
  const { data: products = [], isLoading, error } = useStoreProducts(storeId);
  const deleteMutation = useDeleteStoreProduct(storeId);

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
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Productos</CardTitle>
            <CardDescription>Administra el catálogo de tu tienda.</CardDescription>
          </div>
          <Button size="sm" className="gap-1.5 shrink-0" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Crear producto
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <p className="text-sm text-destructive py-6 text-center">{(error as Error).message}</p>
          ) : (
            <div className="rounded-md border border-border overflow-x-auto">
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
                  {products.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                        Aún no hay productos. Usa «Crear producto» para añadir el primero.
                      </TableCell>
                    </TableRow>
                  ) : (
                    products.map((product) => (
                      <TableRow key={product.id}>
                        <TableCell>
                          <ProductThumbnail imageUrls={product.imageUrls ?? []} />
                        </TableCell>
                        <TableCell className="font-medium">{product.name}</TableCell>
                        <TableCell>{formatPrice(product.price)}</TableCell>
                        <TableCell>
                          <ShowcaseToggle storeId={storeId} product={product} />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label="Ver detalle"
                              onClick={() => setDetailProduct(product)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label="Editar"
                              onClick={() => openEdit(product)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              aria-label="Eliminar"
                              onClick={() => setDeleteTarget(product)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <StoreProductFormDialog
        storeId={storeId}
        open={formOpen}
        onOpenChange={setFormOpen}
        product={editProduct}
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
