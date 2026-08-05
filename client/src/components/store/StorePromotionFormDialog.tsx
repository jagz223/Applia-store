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
import { StoreCoverPhotoPicker } from "@/components/store/StoreCoverPhotoPicker";
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
import { NumberField } from "@/components/ui/number-field";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { uploadStorePromotionImage } from "@/lib/firebase-client";
import { revokeBlobPreview } from "@/lib/store-image-draft";
import { cn } from "@/lib/utils";

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
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);

  const createMutation = useCreateStorePromotion(storeId);
  const updateMutation = useUpdateStorePromotion(storeId);
  const saving = createMutation.isPending || updateMutation.isPending;

  useEffect(() => {
    if (!open) return;
    if (promotion) {
      setName(promotion.name);
      setDescription(promotion.description ?? "");
      setPrice(String(promotion.price));
      setImagePreviewUrl(promotion.imageUrl ?? null);
      setPendingImageFile(null);
    } else {
      setName("");
      setDescription("");
      setPrice("");
      setSelectedProducts([]);
      setImagePreviewUrl(null);
      setPendingImageFile(null);
    }
  }, [open, promotion]);

  useEffect(() => {
    if (!open || !promotion) return;
    setSelectedProducts(promotionProductsFromItems(products, promotion.items));
  }, [open, promotion, products]);

  function handleOpenChange(next: boolean) {
    if (!next) {
      if (imagePreviewUrl?.startsWith("blob:")) revokeBlobPreview(imagePreviewUrl);
      setPendingImageFile(null);
    }
    onOpenChange(next);
  }

  function handleImagePreviewChange(url: string | null, file?: File | null) {
    setImagePreviewUrl(url);
    setPendingImageFile(file ?? null);
  }

  async function resolveImageUrl(): Promise<string | null> {
    if (pendingImageFile) {
      return uploadStorePromotionImage(storeId, pendingImageFile);
    }
    if (imagePreviewUrl?.trim()) {
      return imagePreviewUrl.trim();
    }
    return null;
  }

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

    try {
      const imageUrl = await resolveImageUrl();
      const payload = {
        name: trimmedName,
        description: description.trim() || null,
        imageUrl,
        price: parsedPrice,
        status: (promotion?.status ?? "active") as "active" | "inactive",
        items: selectedProducts.map((p) => ({
          productId: p.id,
          quantity: p.quantity,
          status: p.status,
        })),
      };

      if (isEdit && promotion) {
        await updateMutation.mutateAsync({ promotionId: promotion.id, body: payload });
        toast({ title: "Promoción actualizada" });
      } else {
        await createMutation.mutateAsync(payload);
        toast({ title: "Promoción creada" });
      }
      if (imagePreviewUrl?.startsWith("blob:")) revokeBlobPreview(imagePreviewUrl);
      setPendingImageFile(null);
      handleOpenChange(false);
    } catch (err) {
      toast({
        variant: "destructive",
        title: isEdit ? "No se pudo actualizar" : "No se pudo crear",
        description: err instanceof Error ? err.message : "Error desconocido",
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        layer="elevated"
        shellClassName={storeAdminDialogShellClass}
        className={storeAdminDialogContentClass()}
      >
        <DialogHeader className={storeAdminDialogHeaderClass}>
          <DialogTitle className="pr-8 font-display text-xl tracking-tight">
            {isEdit ? "Editar promoción" : "Crear promoción"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Modifica el combo o promoción y sus productos."
              : "Define nombre, precio del pack y los productos incluidos."}
          </DialogDescription>
        </DialogHeader>

        <form className="flex min-h-0 flex-1 flex-col" onSubmit={(e) => void handleSubmit(e)}>
          <div className={storeAdminDialogBodyClass}>
            <div className="space-y-2">
              <Label htmlFor="promotion-name">Nombre</Label>
              <Input
                id="promotion-name"
                className={storeAdminFieldClass}
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
                className={cn(storeAdminFieldClass, "h-auto min-h-[5.5rem] py-3")}
                value={description}
                rows={3}
                maxLength={500}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <StoreCoverPhotoPicker
              label="Imagen de la promoción"
              previewUrl={imagePreviewUrl}
              disabled={saving}
              onPreviewChange={handleImagePreviewChange}
            />

            <div className="space-y-3 rounded-2xl border border-border/70 bg-muted/20 p-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="promotion-price">Precio del pack (USD)</Label>
                <NumberField
                  id="promotion-price"
                  min={0.01}
                  step="0.01"
                  value={price}
                  required
                  onChange={setPrice}
                />
              </div>
            </div>

            <StorePromotionProductPicker
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
              onClick={() => handleOpenChange(false)}
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
