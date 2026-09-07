import { useEffect, useState } from "react";
import { Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useStoreCategories } from "@/hooks/use-store-categories";
import {
  useCreateStoreSubcategory,
  useDeleteStoreSubcategory,
  useStoreSubcategoriesPage,
  useUpdateStoreSubcategory,
  type StoreSubcategorySummary,
} from "@/hooks/use-store-subcategories";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

const ADMIN_SUBCATEGORIES_PAGE_SIZE = 10;

export function StoreAdminSubcategoriesPanel({ storeId }: { storeId: number }) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [filterCategoryId, setFilterCategoryId] = useState<string>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editItem, setEditItem] = useState<StoreSubcategorySummary | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [categoryIdDraft, setCategoryIdDraft] = useState<string>("");
  const [deleteTarget, setDeleteTarget] = useState<StoreSubcategorySummary | null>(null);

  const { data: categories = [] } = useStoreCategories(storeId);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(t);
  }, [search]);

  const categoryFilter =
    filterCategoryId !== "all" ? Number.parseInt(filterCategoryId, 10) : null;

  const { data, isLoading, error, isFetching } = useStoreSubcategoriesPage(
    storeId,
    page,
    ADMIN_SUBCATEGORIES_PAGE_SIZE,
    true,
    debouncedSearch,
    categoryFilter,
  );
  const createMutation = useCreateStoreSubcategory(storeId);
  const updateMutation = useUpdateStoreSubcategory(storeId);
  const deleteMutation = useDeleteStoreSubcategory(storeId);

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageLimit = data?.limit ?? ADMIN_SUBCATEGORIES_PAGE_SIZE;
  const totalPages = data?.totalPages ?? Math.max(1, Math.ceil(total / pageLimit));
  const saving = createMutation.isPending || updateMutation.isPending;

  function openCreate() {
    setEditItem(null);
    setNameDraft("");
    setCategoryIdDraft(categories[0] ? String(categories[0].id) : "");
    setFormOpen(true);
  }

  function openEdit(item: StoreSubcategorySummary) {
    setEditItem(item);
    setNameDraft(item.name);
    setCategoryIdDraft(String(item.categoryId));
    setFormOpen(true);
  }

  async function handleSave() {
    const name = nameDraft.trim();
    const categoryId = Number.parseInt(categoryIdDraft, 10);
    if (!name) {
      toast({ variant: "destructive", title: "Nombre obligatorio" });
      return;
    }
    if (!Number.isFinite(categoryId) || categoryId <= 0) {
      toast({ variant: "destructive", title: "Selecciona una categoría" });
      return;
    }
    try {
      if (editItem) {
        await updateMutation.mutateAsync({
          subcategoryId: editItem.id,
          body: { name, categoryId },
        });
        toast({ title: "Subcategoría actualizada" });
      } else {
        await createMutation.mutateAsync({ name, categoryId, description: null });
        toast({ title: "Subcategoría creada" });
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
        title: "Eliminada",
        description: `«${deleteTarget.name}» se eliminó de la tienda y de los productos.`,
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
            <CardTitle className="font-display text-xl tracking-tight">Subcategorías</CardTitle>
            <CardDescription className="text-sm leading-snug">
              Organiza cada categoría en subcategorías. Filtra, edita o elimina las que uses en
              productos.
            </CardDescription>
          </div>
          <Button
            size="sm"
            className="h-10 shrink-0 gap-1.5 rounded-full"
            onClick={openCreate}
            disabled={categories.length === 0}
          >
            <Plus className="h-4 w-4" />
            Crear
          </Button>
        </CardHeader>
        <CardContent className="space-y-4 px-4 pb-5 sm:px-6">
          {categories.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border/80 px-4 py-8 text-center text-sm text-muted-foreground">
              Primero crea al menos una categoría para poder añadir subcategorías.
            </p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-[1fr_14rem]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filtrar por nombre…"
                className={cn(storeAdminFieldClass, "pl-9")}
                aria-label="Filtrar subcategorías"
              />
            </div>
            <Select
              value={filterCategoryId}
              onValueChange={(v) => {
                setFilterCategoryId(v);
                setPage(1);
              }}
            >
              <SelectTrigger className={storeAdminFieldClass}>
                <SelectValue placeholder="Categoría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las categorías</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                {debouncedSearch || categoryFilter
                  ? "No hay coincidencias con ese filtro."
                  : "Aún no hay subcategorías. Usa «Crear» para añadir la primera."}
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
                      <p className="truncate text-xs text-muted-foreground">
                        {item.categoryName ?? `Categoría #${item.categoryId}`}
                      </p>
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
                      <th className="px-4 py-2.5 font-medium">Categoría</th>
                      <th className="w-[8rem] px-4 py-2.5 text-right font-medium">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id} className="border-b border-border/60 last:border-0">
                        <td className="px-4 py-3 font-medium">{item.name}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {item.categoryName ?? `Categoría #${item.categoryId}`}
                        </td>
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
          className={storeAdminDialogContentClass("h-auto max-h-[min(92dvh,28rem)]")}
        >
          <DialogHeader className={storeAdminDialogHeaderClass}>
            <DialogTitle className="pr-8 font-display text-xl tracking-tight">
              {editItem ? "Editar subcategoría" : "Crear subcategoría"}
            </DialogTitle>
            <DialogDescription>
              Cada subcategoría pertenece a una categoría de la tienda.
            </DialogDescription>
          </DialogHeader>
          <div className={storeAdminDialogBodyClass}>
            <div className="space-y-2">
              <Label htmlFor="subcategory-category">Categoría</Label>
              <Select value={categoryIdDraft} onValueChange={setCategoryIdDraft}>
                <SelectTrigger id="subcategory-category" className={storeAdminFieldClass}>
                  <SelectValue placeholder="Selecciona categoría" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="subcategory-name">Nombre</Label>
              <Input
                id="subcategory-name"
                className={storeAdminFieldClass}
                value={nameDraft}
                maxLength={120}
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

      <AlertDialog
        open={deleteTarget != null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar subcategoría</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará «{deleteTarget?.name}» y se quitará de todos los productos que la tengan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void confirmDelete()}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
