import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  useCreateStoreProduct,
  useUpdateStoreProduct,
  type StoreProductSummary,
} from "@/hooks/use-store-products";
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
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  IngredientMaterialPicker,
  type SelectedIngredient,
} from "@/components/store/IngredientMaterialPicker";
import { StoreProductCategoryPicker } from "@/components/store/StoreProductCategoryPicker";
import type { SelectedEntity } from "@/components/store/StoreEntityMultiPicker";
import { categoriesFromIds, useStoreCategories } from "@/hooks/use-store-categories";
import { StoreProductPhotosPicker } from "@/components/store/StoreProductPhotosPicker";
import { uploadStoreProductImage } from "@/lib/firebase-client";
import {
  draftsFromSavedUrls,
  revokeBlobPreviews,
  type StoreImageDraft,
} from "@/lib/store-image-draft";

async function resolveIngredientNames(ids: number[]): Promise<SelectedIngredient[]> {
  if (ids.length === 0) return [];
  const token = localStorage.getItem("token");
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const nameById = new Map<number, string>();
  let page = 1;
  let total = Infinity;

  while (nameById.size < ids.length && (page - 1) * 20 < total && page <= 30) {
    const res = await fetch(`/api/ingredients-materials?page=${page}`, { headers });
    if (!res.ok) break;
    const data = (await res.json().catch(() => null)) as {
      items?: { id: number; name: string }[];
      total?: number;
    } | null;
    const items = Array.isArray(data?.items) ? data.items : [];
    if (items.length === 0) break;
    total = typeof data?.total === "number" ? data.total : items.length;
    for (const item of items) {
      if (ids.includes(item.id)) nameById.set(item.id, item.name);
    }
    page += 1;
  }

  return ids.map((id) => ({ id, name: nameById.get(id) ?? `Item #${id}` }));
}

export function StoreProductFormDialog({
  storeId,
  open,
  onOpenChange,
  product,
}: {
  storeId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: StoreProductSummary | null;
}) {
  const { toast } = useToast();
  const isEdit = product != null;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [hasIngredients, setHasIngredients] = useState(false);
  const [ingredients, setIngredients] = useState<SelectedIngredient[]>([]);
  const [categories, setCategories] = useState<SelectedEntity[]>([]);
  const [imageDrafts, setImageDrafts] = useState<StoreImageDraft[]>([]);
  const [resolving, setResolving] = useState(false);

  const { data: allCategories = [] } = useStoreCategories(storeId, open);

  const createMutation = useCreateStoreProduct(storeId);
  const updateMutation = useUpdateStoreProduct(storeId);
  const saving = createMutation.isPending || updateMutation.isPending;

  const formSessionRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      formSessionRef.current = null;
      return;
    }

    const session = product ? `edit:${product.id}` : "create";
    if (formSessionRef.current === session) return;
    formSessionRef.current = session;

    if (product) {
      setName(product.name);
      setDescription(product.description ?? "");
      setPrice(String(product.price));
      const ids = product.ingredientMaterialIds ?? [];
      setHasIngredients(ids.length > 0);
      setResolving(ids.length > 0);
      void resolveIngredientNames(ids)
        .then((resolved) => {
          setIngredients(resolved);
          setResolving(false);
        })
        .catch(() => {
          setIngredients(ids.map((id) => ({ id, name: `Item #${id}` })));
          setResolving(false);
        });
      setImageDrafts(draftsFromSavedUrls(product.imageUrls ?? []));
      setCategories(categoriesFromIds(allCategories, product.categoryIds ?? []));
    } else {
      setName("");
      setDescription("");
      setPrice("");
      setHasIngredients(false);
      setIngredients([]);
      setCategories([]);
      setImageDrafts([]);
      setResolving(false);
    }
  }, [open, product, allCategories]);

  useEffect(() => {
    if (!open || allCategories.length === 0) return;
    setCategories((prev) => {
      const map = new Map(allCategories.map((c) => [c.id, c.name]));
      return prev.map((p) => ({ id: p.id, name: map.get(p.id) ?? p.name }));
    });
  }, [open, allCategories]);

  function handleOpenChange(next: boolean) {
    if (!next) revokeBlobPreviews(imageDrafts);
    onOpenChange(next);
  }

  async function resolveImageUrlsFromDrafts(drafts: StoreImageDraft[]): Promise<string[]> {
    const urls: string[] = [];
    for (const draft of drafts) {
      if (draft.pendingFile) {
        urls.push(await uploadStoreProductImage(storeId, draft.pendingFile));
      } else {
        urls.push(draft.previewUrl);
      }
    }
    return urls.slice(0, 4);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    const priceNum = Number(price);
    if (!trimmedName) {
      toast({ variant: "destructive", title: "Nombre obligatorio" });
      return;
    }
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      toast({ variant: "destructive", title: "Precio inválido", description: "Ingresa un número mayor a 0." });
      return;
    }

    try {
      const imageUrls = await resolveImageUrlsFromDrafts(imageDrafts);
      const payload = {
        name: trimmedName,
        description: description.trim() || null,
        price: priceNum,
        categoryIds: categories.map((c) => c.id),
        ingredientMaterialIds: hasIngredients ? ingredients.map((i) => i.id) : [],
        imageUrls,
      };

      if (isEdit && product) {
        await updateMutation.mutateAsync({ productId: product.id, body: payload });
        toast({ title: "Producto actualizado" });
      } else {
        await createMutation.mutateAsync(payload);
        toast({ title: "Producto creado" });
      }
      revokeBlobPreviews(imageDrafts);
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
      <DialogContent layer="elevated" className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar producto" : "Crear producto"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Modifica los datos del producto." : "Añade un producto al catálogo de tu tienda."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="product-name">Nombre</Label>
            <Input
              id="product-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="product-description">Descripción</Label>
            <Textarea
              id="product-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={5000}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="product-price">Precio (USD)</Label>
            <Input
              id="product-price"
              type="number"
              min="0.01"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
            />
          </div>

          <StoreProductPhotosPicker
            drafts={imageDrafts}
            onChange={setImageDrafts}
            disabled={saving}
          />

          <StoreProductCategoryPicker
            storeId={storeId}
            selected={categories}
            disabled={saving}
            onChange={setCategories}
          />

          <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="product-has-ingredients">¿Tiene ingredientes o materiales?</Label>
              <p className="text-xs text-muted-foreground">Opcional. Selecciona de la lista global.</p>
            </div>
            <Switch
              id="product-has-ingredients"
              checked={hasIngredients}
              onCheckedChange={(checked) => {
                setHasIngredients(checked);
                if (!checked) setIngredients([]);
              }}
            />
          </div>

          {hasIngredients ? (
            resolving ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cargando ingredientes…
              </div>
            ) : (
              <IngredientMaterialPicker selected={ingredients} onChange={setIngredients} />
            )
          ) : null}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>
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
