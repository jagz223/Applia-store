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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

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
  const [selectedProducts, setSelectedProducts] = useState<SelectedEntity[]>([]);

  const createMutation = useCreateStoreCategory(storeId);
  const updateMutation = useUpdateStoreCategory(storeId);
  const saving = createMutation.isPending || updateMutation.isPending;

  useEffect(() => {
    if (!open) return;
    if (category) {
      setName(category.name);
      setDescription(category.description ?? "");
    } else {
      setName("");
      setDescription("");
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
      <DialogContent layer="elevated" className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar categoría" : "Crear categoría"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Modifica la categoría y sus productos asociados."
              : "Agrupa productos para organizar tu catálogo."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="category-name">Nombre</Label>
            <Input
              id="category-name"
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
              value={description}
              rows={3}
              maxLength={500}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <StoreCategoryProductPicker
            storeId={storeId}
            selected={selectedProducts}
            disabled={saving}
            onChange={setSelectedProducts}
          />

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {isEdit ? "Guardar" : "Crear"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
