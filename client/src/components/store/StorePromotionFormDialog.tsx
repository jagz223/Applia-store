import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  useCreateStorePromotion,
  useUpdateStorePromotion,
  promotionProductsFromItems,
  type StorePromotionSummary,
} from "@/hooks/use-store-promotions";
import { useStoreProducts } from "@/hooks/use-store-products";
import {
  StorePromotionProductPicker,
  type SelectedPromotionProduct,
} from "@/components/store/StorePromotionProductPicker";
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

export function StorePromotionFormDialog({
  storeId,
  open,
  onOpenChange,
  promotion,
}: {
  storeId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  promotion?: StorePromotionSummary | null;
}) {
  const { toast } = useToast();
  const isEdit = promotion != null;
  const { data: products = [] } = useStoreProducts(storeId, open);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<SelectedPromotionProduct[]>([]);

  const createMutation = useCreateStorePromotion(storeId);
  const updateMutation = useUpdateStorePromotion(storeId);
  const saving = createMutation.isPending || updateMutation.isPending;

  useEffect(() => {
    if (!open) return;
    if (promotion) {
      setName(promotion.name);
      setDescription(promotion.description ?? "");
      setPrice(String(promotion.price));
    } else {
      setName("");
      setDescription("");
      setPrice("");
      setSelectedProducts([]);
    }
  }, [open, promotion]);

  useEffect(() => {
    if (!open || !promotion) return;
    setSelectedProducts(promotionProductsFromItems(products, promotion.items));
  }, [open, promotion, products]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast({ variant: "destructive", title: "Nombre obligatorio" });
      return;
    }
    const parsedPrice = Number.parseFloat(price.replace(",", "."));
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      toast({ variant: "destructive", title: "Precio inválido", description: "Indica un precio mayor a cero." });
      return;
    }
    if (selectedProducts.length === 0) {
      toast({ variant: "destructive", title: "Productos obligatorios", description: "Añade al menos un producto." });
      return;
    }

    const payload = {
      name: trimmedName,
      description: description.trim() || null,
      price: parsedPrice,
      status: (promotion?.status ?? "active") as "active" | "inactive",
      items: selectedProducts.map((p) => ({
        productId: p.id,
        quantity: p.quantity,
        status: p.status,
      })),
    };

    try {
      if (isEdit && promotion) {
        await updateMutation.mutateAsync({ promotionId: promotion.id, body: payload });
        toast({ title: "Promoción actualizada" });
      } else {
        await createMutation.mutateAsync(payload);
        toast({ title: "Promoción creada" });
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
          <DialogTitle>{isEdit ? "Editar promoción" : "Crear promoción"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Modifica el combo o promoción y sus productos."
              : "Define nombre, precio del pack y los productos incluidos."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="promotion-name">Nombre</Label>
            <Input
              id="promotion-name"
              value={name}
              maxLength={120}
              required
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="promotion-description">Descripción</Label>
            <Textarea
              id="promotion-description"
              value={description}
              rows={3}
              maxLength={500}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="promotion-price">Precio del pack (USD)</Label>
            <Input
              id="promotion-price"
              type="number"
              min={0.01}
              step="0.01"
              value={price}
              required
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>

          <StorePromotionProductPicker
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
