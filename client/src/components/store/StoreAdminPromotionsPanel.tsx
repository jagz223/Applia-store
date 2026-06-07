import { useEffect, useState } from "react";
import { Eye, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import {
  useDeleteStorePromotion,
  useStorePromotions,
  useUpdateStorePromotion,
  type StorePromotionSummary,
} from "@/hooks/use-store-promotions";
import { StorePromotionFormDialog } from "@/components/store/StorePromotionFormDialog";
import { StorePromotionDetailDialog } from "@/components/store/StorePromotionDetailDialog";
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

function PromotionStatusToggle({
  storeId,
  promotion,
}: {
  storeId: number;
  promotion: StorePromotionSummary;
}) {
  const { toast } = useToast();
  const updateMutation = useUpdateStorePromotion(storeId);
  const [checked, setChecked] = useState(promotion.status === "active");
  const busy =
    updateMutation.isPending && updateMutation.variables?.promotionId === promotion.id;

  useEffect(() => {
    setChecked(promotion.status === "active");
  }, [promotion.id, promotion.status]);

  async function handleChange(next: boolean) {
    const prev = checked;
    setChecked(next);
    try {
      await updateMutation.mutateAsync({
        promotionId: promotion.id,
        body: { status: next ? "active" : "inactive" },
      });
      toast({
        title: next ? "Promoción activa" : "Promoción inactiva",
        description: next
          ? `«${promotion.name}» está visible como activa.`
          : `«${promotion.name}» quedó inactiva.`,
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
    <div className="flex shrink-0 items-center gap-1.5">
      <Switch
        id={`promo-status-${promotion.id}`}
        checked={checked}
        disabled={busy}
        onCheckedChange={(v) => void handleChange(v)}
        aria-label={`${checked ? "Desactivar" : "Activar"} ${promotion.name}`}
      />
      <Label
        htmlFor={`promo-status-${promotion.id}`}
        className={cn("text-xs cursor-pointer whitespace-nowrap", busy && "opacity-60")}
      >
        {busy ? "Guardando…" : checked ? "Activa" : "Inactiva"}
      </Label>
    </div>
  );
}

export function StoreAdminPromotionsPanel({ storeId }: { storeId: number }) {
  const { toast } = useToast();
  const { data: promotions = [], isLoading, error } = useStorePromotions(storeId);
  const deleteMutation = useDeleteStorePromotion(storeId);

  const [formOpen, setFormOpen] = useState(false);
  const [editPromotion, setEditPromotion] = useState<StorePromotionSummary | null>(null);
  const [detailPromotion, setDetailPromotion] = useState<StorePromotionSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StorePromotionSummary | null>(null);

  function openCreate() {
    setEditPromotion(null);
    setFormOpen(true);
  }

  function openEdit(promotion: StorePromotionSummary) {
    setEditPromotion(promotion);
    setFormOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      toast({ title: "Promoción eliminada", description: `«${deleteTarget.name}» fue eliminada.` });
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
            <CardTitle>Promociones</CardTitle>
            <CardDescription>Combos y packs con varios productos a un precio especial.</CardDescription>
          </div>
          <Button size="sm" className="gap-1.5 shrink-0" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Crear promoción
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
                    <TableHead>Nombre</TableHead>
                    <TableHead className="w-[120px]">Precio</TableHead>
                    <TableHead className="min-w-[280px] text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {promotions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                        Aún no hay promociones. Usa «Crear promoción» para añadir la primera.
                      </TableCell>
                    </TableRow>
                  ) : (
                    promotions.map((promotion) => (
                      <TableRow key={promotion.id}>
                        <TableCell className="font-medium">{promotion.name}</TableCell>
                        <TableCell>{formatPrice(promotion.price)}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <div className="inline-flex flex-nowrap items-center justify-end gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label="Ver detalle"
                              onClick={() => setDetailPromotion(promotion)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label="Editar"
                              onClick={() => openEdit(promotion)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <PromotionStatusToggle storeId={storeId} promotion={promotion} />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              aria-label="Eliminar"
                              onClick={() => setDeleteTarget(promotion)}
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

      <StorePromotionFormDialog
        storeId={storeId}
        open={formOpen}
        onOpenChange={setFormOpen}
        promotion={editPromotion}
      />

      <StorePromotionDetailDialog
        promotion={detailPromotion}
        open={detailPromotion != null}
        onOpenChange={(o) => !o && setDetailPromotion(null)}
      />

      <AlertDialog open={deleteTarget != null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar promoción?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `«${deleteTarget.name}» se eliminará permanentemente.`
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
