import { useEffect, useState } from "react";
import { Eye, ImageIcon, Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import {
  useDeleteStorePromotion,
  useStorePromotionsPage,
  useUpdateStorePromotion,
  type StorePromotionSummary,
} from "@/hooks/use-store-promotions";
import { StorePromotionFormDialog } from "@/components/store/StorePromotionFormDialog";
import { StorePromotionDetailDialog } from "@/components/store/StorePromotionDetailDialog";
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

function formatPrice(value: number) {
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(value);
}

function PromotionThumbnail({ imageUrl }: { imageUrl: string | null }) {
  const url = imageUrl?.trim();
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
      referrerPolicy="no-referrer"
      className="h-12 w-12 shrink-0 rounded-md border border-border object-cover bg-muted/30"
    />
  );
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

function PromotionRowActions({
  storeId,
  promotion,
  onDetail,
  onEdit,
  onDelete,
}: {
  storeId: number;
  promotion: StorePromotionSummary;
  onDetail: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
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
      <PromotionStatusToggle storeId={storeId} promotion={promotion} />
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

export function StoreAdminPromotionsPanel({ storeId }: { storeId: number }) {
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

  const { data, isLoading, error, isFetching } = useStorePromotionsPage(
    storeId,
    page,
    STORE_ADMIN_LIST_PAGE_SIZE,
    true,
    debouncedSearch,
  );
  const promotions = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
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
      if (promotions.length <= 1 && page > 1) setPage((p) => Math.max(1, p - 1));
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
            <CardTitle className="font-display">Promociones</CardTitle>
            <CardDescription>Combos y packs con varios productos a un precio especial.</CardDescription>
          </div>
          <Button size="sm" className="h-10 shrink-0 gap-1.5 rounded-full" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Crear promoción
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
              aria-label="Filtrar promociones por nombre"
            />
          </div>

          {isLoading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <p className="text-sm text-destructive py-6 text-center">{(error as Error).message}</p>
          ) : promotions.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {debouncedSearch
                ? "No hay coincidencias con ese filtro."
                : "Aún no hay promociones. Usa «Crear promoción» para añadir la primera."}
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {total} resultado{total === 1 ? "" : "s"}
                {isFetching ? " · actualizando…" : ""}
              </p>

              <ul className="grid gap-3 md:hidden">
                {promotions.map((promotion) => (
                  <li
                    key={promotion.id}
                    className="rounded-2xl border border-border/70 bg-card/95 p-3.5 shadow-sm"
                  >
                    <div className="flex gap-3">
                      <PromotionThumbnail imageUrl={promotion.imageUrl} />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{promotion.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {formatPrice(promotion.price)}
                          </p>
                        </div>
                        <PromotionStatusToggle storeId={storeId} promotion={promotion} />
                        <div className="flex flex-wrap gap-1">
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
                      <TableHead className="w-[180px] text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {promotions.map((promotion) => (
                      <TableRow key={promotion.id}>
                        <TableCell>
                          <PromotionThumbnail imageUrl={promotion.imageUrl} />
                        </TableCell>
                        <TableCell className="font-medium">{promotion.name}</TableCell>
                        <TableCell>{formatPrice(promotion.price)}</TableCell>
                        <TableCell className="text-right">
                          <PromotionRowActions
                            storeId={storeId}
                            promotion={promotion}
                            onDetail={() => setDetailPromotion(promotion)}
                            onEdit={() => openEdit(promotion)}
                            onDelete={() => setDeleteTarget(promotion)}
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
