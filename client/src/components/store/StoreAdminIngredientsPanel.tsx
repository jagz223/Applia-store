import { useEffect, useState } from "react";
import { Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import {
  useCreateIngredientMaterialMutation,
  useDeleteIngredientMaterial,
  useIngredientsMaterials,
  useUpdateIngredientMaterial,
  type IngredientMaterialItem,
} from "@/hooks/use-store-products";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  storeAdminDialogBodyClass,
  storeAdminDialogContentClass,
  storeAdminDialogFooterClass,
  storeAdminDialogHeaderClass,
  storeAdminDialogShellClass,
  storeAdminFieldClass,
  storeAdminSectionCardClass,
} from "@/components/store/store-admin-ui";

const ADMIN_INGREDIENTS_PAGE_SIZE = 10;

export function StoreAdminIngredientsPanel() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editItem, setEditItem] = useState<IngredientMaterialItem | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<IngredientMaterialItem | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(t);
  }, [search]);

  const { data, isLoading, error, isFetching } = useIngredientsMaterials(
    debouncedSearch,
    page,
    true,
    ADMIN_INGREDIENTS_PAGE_SIZE,
  );
  const createMutation = useCreateIngredientMaterialMutation();
  const updateMutation = useUpdateIngredientMaterial();
  const deleteMutation = useDeleteIngredientMaterial();

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageLimit = data?.limit ?? ADMIN_INGREDIENTS_PAGE_SIZE;
  const totalPages = data?.totalPages ?? Math.max(1, Math.ceil(total / pageLimit));
  const saving = createMutation.isPending || updateMutation.isPending;

  function openCreate() {
    setEditItem(null);
    setNameDraft("");
    setFormOpen(true);
  }

  function openEdit(item: IngredientMaterialItem) {
    setEditItem(item);
    setNameDraft(item.name);
    setFormOpen(true);
  }

  async function handleSave() {
    const name = nameDraft.trim();
    if (!name) {
      toast({ variant: "destructive", title: "Nombre obligatorio" });
      return;
    }
    try {
      if (editItem) {
        await updateMutation.mutateAsync({ id: editItem.id, name });
        toast({ title: "Ingrediente actualizado" });
      } else {
        await createMutation.mutateAsync(name);
        toast({ title: "Ingrediente creado" });
      }
      setFormOpen(false);
      setEditItem(null);
      setNameDraft("");
    } catch (e) {
      toast({
        variant: "destructive",
        title: editItem ? "No se pudo actualizar" : "No se pudo crear",
        description: e instanceof Error ? e.message : "Error desconocido",
      });
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      toast({
        title: "Eliminado",
        description: `«${deleteTarget.name}» fue eliminado del catálogo.`,
      });
      setDeleteTarget(null);
      if (items.length <= 1 && page > 1) setPage((p) => Math.max(1, p - 1));
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
        <CardHeader className="flex flex-col gap-3 space-y-0 px-4 pt-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
          <div className="space-y-1">
            <CardTitle className="font-display text-xl tracking-tight">Ingredientes</CardTitle>
            <CardDescription className="text-sm leading-snug">
              Catálogo global de ingredientes y materiales. Filtra, edita o elimina los que uses en productos.
            </CardDescription>
          </div>
          <Button
            size="sm"
            className="h-10 shrink-0 gap-1.5 rounded-full"
            onClick={openCreate}
          >
            <Plus className="h-4 w-4" />
            Crear
          </Button>
        </CardHeader>
        <CardContent className="space-y-4 px-4 pb-5 sm:px-6">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtrar por nombre…"
              className={cn(storeAdminFieldClass, "pl-9")}
              aria-label="Filtrar ingredientes"
            />
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-7 w-7 animate-spin text-secondary dark:text-primary" />
            </div>
          ) : error ? (
            <p className="py-6 text-center text-sm text-destructive">
              {(error as Error).message}
            </p>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/80 px-4 py-12 text-center">
              <p className="text-sm text-muted-foreground">
                {debouncedSearch
                  ? "No hay coincidencias con ese filtro."
                  : "Aún no hay ingredientes. Usa «Crear» para añadir el primero."}
              </p>
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {total} resultado{total === 1 ? "" : "s"}
                {isFetching ? " · actualizando…" : ""}
              </p>

              <ul className="grid gap-2.5 md:hidden">
                {items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-3.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{item.name}</p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9"
                        aria-label="Editar"
                        onClick={() => openEdit(item)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-destructive hover:text-destructive"
                        aria-label="Eliminar"
                        onClick={() => setDeleteTarget(item)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="hidden overflow-hidden rounded-2xl border border-border/70 md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30 text-left">
                      <th className="px-4 py-2.5 font-medium">Nombre</th>
                      <th className="w-[8rem] px-4 py-2.5 text-right font-medium">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id} className="border-b border-border/60 last:border-0">
                        <td className="px-4 py-3 font-medium">{item.name}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex justify-end gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label="Editar"
                              onClick={() => openEdit(item)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              aria-label="Eliminar"
                              onClick={() => setDeleteTarget(item)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 ? (
                <div className="flex items-center justify-between gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    disabled={page <= 1 || isFetching}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Anterior
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Pág. {page} / {totalPages}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    disabled={page >= totalPages || isFetching}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Siguiente
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent
          layer="elevated"
          shellClassName={storeAdminDialogShellClass}
          className={storeAdminDialogContentClass(
            "h-auto max-h-[min(70dvh,28rem)] sm:max-h-[min(70dvh,28rem)]",
          )}
        >
          <DialogHeader className={storeAdminDialogHeaderClass}>
            <DialogTitle className="pr-8 font-display text-xl tracking-tight">
              {editItem ? "Editar ingrediente" : "Crear ingrediente"}
            </DialogTitle>
            <DialogDescription>
              {editItem
                ? "Cambia el nombre del ingrediente o material."
                : "Añade un nuevo ítem al catálogo global."}
            </DialogDescription>
          </DialogHeader>
          <div className={storeAdminDialogBodyClass}>
            <div className="space-y-2">
              <Label htmlFor="ingredient-name">Nombre</Label>
              <Input
                id="ingredient-name"
                value={nameDraft}
                maxLength={200}
                className={storeAdminFieldClass}
                placeholder="Ej. Queso cheddar"
                autoFocus
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleSave();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter className={storeAdminDialogFooterClass}>
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-full"
              disabled={saving}
              onClick={() => setFormOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="h-11 rounded-full font-semibold"
              disabled={saving}
              onClick={() => void handleSave()}
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {editItem ? "Guardar" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTarget != null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar ingrediente?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `«${deleteTarget.name}» se eliminará del catálogo. Los productos que lo usen dejarán de mostrarlo.`
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
