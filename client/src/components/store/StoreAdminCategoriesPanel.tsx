import { useEffect, useState } from "react";
import { Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import {
  useDeleteStoreCategory,
  useStoreCategoriesPage,
  type StoreCategorySummary,
} from "@/hooks/use-store-categories";
import { StoreCategoryFormDialog } from "@/components/store/StoreCategoryFormDialog";
import {
  STORE_ADMIN_LIST_PAGE_SIZE,
  StoreAdminListPagination,
} from "@/components/store/StoreAdminListPagination";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

export function StoreAdminCategoriesPanel({ storeId }: { storeId: number }) {
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

  const { data, isLoading, error, isFetching } = useStoreCategoriesPage(
    storeId,
    page,
    STORE_ADMIN_LIST_PAGE_SIZE,
    true,
    debouncedSearch,
  );
  const categories = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const deleteMutation = useDeleteStoreCategory(storeId);

  const [formOpen, setFormOpen] = useState(false);
  const [editCategory, setEditCategory] = useState<StoreCategorySummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StoreCategorySummary | null>(null);

  function openCreate() {
    setEditCategory(null);
    setFormOpen(true);
  }

  function openEdit(category: StoreCategorySummary) {
    setEditCategory(category);
    setFormOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      toast({ title: "Categoría eliminada", description: `«${deleteTarget.name}» fue eliminada.` });
      setDeleteTarget(null);
      if (categories.length <= 1 && page > 1) setPage((p) => Math.max(1, p - 1));
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
            <CardTitle className="font-display">Categorías</CardTitle>
            <CardDescription>
              Agrupa productos de tu tienda. Un producto puede estar en varias categorías.
            </CardDescription>
          </div>
          <Button size="sm" className="h-10 shrink-0 gap-1.5 rounded-full" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Crear categoría
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
              aria-label="Filtrar categorías por nombre"
            />
          </div>

          {isLoading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <p className="text-sm text-destructive py-6 text-center">{(error as Error).message}</p>
          ) : categories.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {debouncedSearch
                ? "No hay coincidencias con ese filtro."
                : "Aún no hay categorías. Usa «Crear categoría» para añadir la primera."}
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {total} resultado{total === 1 ? "" : "s"}
                {isFetching ? " · actualizando…" : ""}
              </p>

              <ul className="grid gap-3 md:hidden">
                {categories.map((category) => (
                  <li
                    key={category.id}
                    className="rounded-2xl border border-border/70 bg-card/95 p-3.5 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="font-medium">{category.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {category.productCount}{" "}
                          {category.productCount === 1 ? "producto" : "productos"}
                        </p>
                        <p className="line-clamp-1 text-sm text-muted-foreground">
                          {category.description?.trim() || "Sin descripción"}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label="Editar"
                          onClick={() => openEdit(category)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          aria-label="Eliminar"
                          onClick={() => setDeleteTarget(category)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="hidden rounded-2xl border border-border/70 overflow-hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead className="w-[100px]">Productos</TableHead>
                      <TableHead className="w-[100px] text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {categories.map((category) => (
                      <TableRow key={category.id}>
                        <TableCell className="font-medium">{category.name}</TableCell>
                        <TableCell className="text-muted-foreground text-sm max-w-[240px] truncate">
                          {category.description ?? "—"}
                        </TableCell>
                        <TableCell>{category.productCount}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label="Editar"
                              onClick={() => openEdit(category)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              aria-label="Eliminar"
                              onClick={() => setDeleteTarget(category)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
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

      <StoreCategoryFormDialog
        storeId={storeId}
        open={formOpen}
        onOpenChange={setFormOpen}
        category={editCategory}
      />

      <AlertDialog open={deleteTarget != null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar categoría?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `«${deleteTarget.name}» se eliminará. Los productos no se borran, solo se quita esta agrupación.`
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
