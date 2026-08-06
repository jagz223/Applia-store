import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  useCreateStoreCategory,
  useUpdateStoreCategory,
  productsFromIds,
  type StoreCategorySummary,
} from "@/hooks/use-store-categories";
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

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [hideFromShowcaseAll, setHideFromShowcaseAll] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<SelectedEntity[]>([]);

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
    const payload = {
      name: trimmedName,
      description: description.trim() || null,
      productIds,
      hideFromShowcaseAll,
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
              ? "Modifica la categoría y sus productos asociados."
              : "Agrupa productos para organizar tu catálogo."}
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
