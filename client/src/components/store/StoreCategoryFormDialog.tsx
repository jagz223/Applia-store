import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import {
  useCreateStoreCategory,
  useUpdateStoreCategory,
  productsFromIds,
  type StoreCategorySummary,
} from "@/hooks/use-store-categories";
import { useStoreSubcategories } from "@/hooks/use-store-subcategories";
import { useStoreProducts } from "@/hooks/use-store-products";
import type { SelectedEntity } from "@/components/store/StoreEntityMultiPicker";
import { StoreCategoryProductPicker } from "@/components/store/StoreCategoryProductPicker";
import {
  storeAdminDialogShellClass,
  storeAdminDialogContentClass,
  storeAdminDialogHeaderClass,
  storeAdminDialogBodyClass,
  storeAdminDialogFooterClass,
  storeAdminFieldClass,
} from "@/components/store/store-admin-ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export function StoreCategoryFormDialog({
  storeId,
  open,
  onOpenChange,
  category,
}: {
  storeId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: StoreCategorySummary | null;
}) {
  const { toast } = useToast();
  const isEdit = category != null;
  const { data: products = [] } = useStoreProducts(storeId, open);
  const { data: existingSubs = [] } = useStoreSubcategories(
    storeId,
    open && isEdit,
    category?.id,
  );

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [hideFromShowcaseAll, setHideFromShowcaseAll] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<SelectedEntity[]>([]);
  const [draftSubNames, setDraftSubNames] = useState<string[]>([""]);

  const createMutation = useCreateStoreCategory(storeId);
  const updateMutation = useUpdateStoreCategory(storeId);
  const saving = createMutation.isPending || updateMutation.isPending;

  useEffect(() => {
    if (!open) return;
    if (category) {
      setName(category.name);
      setDescription(category.description ?? "");
      setHideFromShowcaseAll(category.hideFromShowcaseAll === true);
    } else {
      setName("");
      setDescription("");
      setHideFromShowcaseAll(false);
      setSelectedProducts([]);
    }
    setDraftSubNames([""]);
  }, [open, category]);

  useEffect(() => {
    if (!open || !category || products.length === 0) return;
    setSelectedProducts(productsFromIds(products, category.productIds ?? []));
  }, [open, category, products]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast({ variant: "destructive", title: "Nombre obligatorio" });
      return;
    }

    const productIds = selectedProducts.map((p) => p.id);
    const subcategoryNames = draftSubNames.map((n) => n.trim()).filter(Boolean);
    const payload = {
      name: trimmedName,
      description: description.trim() || null,
      productIds,
      hideFromShowcaseAll,
      subcategoryNames,
    };

    try {
      if (isEdit && category) {
        await updateMutation.mutateAsync({ categoryId: category.id, body: payload });
        toast({ title: "Categoría actualizada" });
      } else {
        await createMutation.mutateAsync(payload);
        toast({ title: "Categoría creada" });
      }
      onOpenChange(false);
    } catch (err) {
      toast({
        variant: "destructive",
        title: isEdit ? "No se pudo actualizar" : "No se pudo crear",
        description: err instanceof Error ? err.message : "Error desconocido",
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        layer="elevated"
        shellClassName={storeAdminDialogShellClass}
        className={storeAdminDialogContentClass()}
      >
        <DialogHeader className={storeAdminDialogHeaderClass}>
          <DialogTitle className="pr-8 font-display text-xl tracking-tight">
            {isEdit ? "Editar categoría" : "Crear categoría"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Modifica la categoría, productos y nuevas subcategorías."
              : "Agrupa productos y, si quieres, crea subcategorías a la vez."}
          </DialogDescription>
        </DialogHeader>

        <form className="flex min-h-0 flex-1 flex-col" onSubmit={(e) => void handleSubmit(e)}>
          <div className={storeAdminDialogBodyClass}>
            <div className="space-y-2">
              <Label htmlFor="category-name">Nombre</Label>
              <Input
                id="category-name"
                className={storeAdminFieldClass}
                value={name}
                maxLength={120}
                required
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category-description">Descripción</Label>
              <Textarea
                id="category-description"
                className={cn(storeAdminFieldClass, "h-auto min-h-[5.5rem] py-3")}
                value={description}
                rows={3}
                maxLength={500}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-between gap-4 rounded-2xl border border-border/70 bg-muted/20 p-3.5">
              <div className="space-y-0.5">
                <Label htmlFor="category-hide-from-all">Mostrar solo en categoría</Label>
                <p className="text-xs text-muted-foreground">
                  Los productos de esta categoría no aparecen en «Todo» de la vitrina; sí al filtrar
                  por esta u otras categorías.
                </p>
              </div>
              <Switch
                id="category-hide-from-all"
                checked={hideFromShowcaseAll}
                onCheckedChange={setHideFromShowcaseAll}
                disabled={saving}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Subcategorías</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-full"
                  disabled={saving || draftSubNames.length >= 50}
                  onClick={() => setDraftSubNames((prev) => [...prev, ""])}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Añadir
                </Button>
              </div>
              {isEdit && existingSubs.length > 0 ? (
                <ul className="space-y-1 rounded-xl border border-border/70 bg-muted/15 px-3 py-2 text-sm">
                  {existingSubs.map((s) => (
                    <li key={s.id} className="text-muted-foreground">
                      {s.name}
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className="text-xs text-muted-foreground">
                {isEdit
                  ? "Puedes añadir nombres nuevos; se crearán al guardar."
                  : "Opcional. Se crearán junto con la categoría."}
              </p>
              <div className="space-y-2">
                {draftSubNames.map((value, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      className={storeAdminFieldClass}
                      value={value}
                      maxLength={120}
                      placeholder={`Subcategoría ${index + 1}`}
                      disabled={saving}
                      onChange={(e) =>
                        setDraftSubNames((prev) =>
                          prev.map((row, i) => (i === index ? e.target.value : row)),
                        )
                      }
                    />
                    {draftSubNames.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-11 w-11 shrink-0 text-muted-foreground hover:text-destructive"
                        disabled={saving}
                        aria-label="Quitar"
                        onClick={() =>
                          setDraftSubNames((prev) => prev.filter((_, i) => i !== index))
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            <StoreCategoryProductPicker
              storeId={storeId}
              selected={selectedProducts}
              disabled={saving}
              onChange={setSelectedProducts}
            />
          </div>

          <DialogFooter className={storeAdminDialogFooterClass}>
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-full"
              disabled={saving}
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" className="h-11 rounded-full font-semibold" disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isEdit ? "Guardar" : "Crear"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
