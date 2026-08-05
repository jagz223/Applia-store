import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  useCreateStoreProduct,
  useUpdateStoreProduct,
  type StoreProductSummary,
} from "@/hooks/use-store-products";
import {
  STORE_CURRENCY_USD_ID,
  currencyLabelForId,
  type StoreCurrencyExtra,
} from "@shared/store-currency-schema";
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
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  IngredientMaterialPicker,
  type SelectedIngredient,
} from "@/components/store/IngredientMaterialPicker";
import { ProductRemovableIngredientsPicker } from "@/components/store/ProductRemovableIngredientsPicker";
import {
  ProductIngredientAdditionalsEditor,
  type ProductIngredientAdditionalDraft,
} from "@/components/store/ProductIngredientAdditionalsEditor";
import { StoreProductCategoryPicker } from "@/components/store/StoreProductCategoryPicker";
import type { SelectedEntity } from "@/components/store/StoreEntityMultiPicker";
import { categoriesFromIds, useStoreCategories } from "@/hooks/use-store-categories";
import { StoreProductPhotosPicker } from "@/components/store/StoreProductPhotosPicker";
import {
  storeAdminDialogShellClass,
  storeAdminDialogContentClass,
  storeAdminDialogHeaderClass,
  storeAdminDialogBodyClass,
  storeAdminDialogFooterClass,
  storeAdminFieldClass,
} from "@/components/store/store-admin-ui";
import { uploadStoreProductImage } from "@/lib/firebase-client";
import {
  draftsFromSavedUrls,
  revokeBlobPreviews,
  type StoreImageDraft,
} from "@/lib/store-image-draft";
import { cn } from "@/lib/utils";

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

function emptyPrices(ids: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const id of ids) out[id] = "";
  return out;
}

export function StoreProductFormDialog({
  storeId,
  open,
  onOpenChange,
  product,
  acceptedPaymentIds = [STORE_CURRENCY_USD_ID],
  currencyExtras = [],
  visualCurrencyId = STORE_CURRENCY_USD_ID,
}: {
  storeId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: StoreProductSummary | null;
  acceptedPaymentIds?: string[];
  currencyExtras?: StoreCurrencyExtra[];
  visualCurrencyId?: string;
}) {
  const { toast } = useToast();
  const isEdit = product != null;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [prices, setPrices] = useState<Record<string, string>>(() => emptyPrices(acceptedPaymentIds));
  const [hasIngredients, setHasIngredients] = useState(false);
  const [ingredients, setIngredients] = useState<SelectedIngredient[]>([]);
  const [removableIds, setRemovableIds] = useState<number[]>([]);
  const [hasAdditionals, setHasAdditionals] = useState(false);
  const [additionals, setAdditionals] = useState<ProductIngredientAdditionalDraft[]>([]);
  const [categories, setCategories] = useState<SelectedEntity[]>([]);
  const [imageDrafts, setImageDrafts] = useState<StoreImageDraft[]>([]);
  const [resolving, setResolving] = useState(false);

  const { data: allCategories = [] } = useStoreCategories(storeId, open);

  const createMutation = useCreateStoreProduct(storeId);
  const updateMutation = useUpdateStoreProduct(storeId);
  const saving = createMutation.isPending || updateMutation.isPending;

  const formSessionRef = useRef<string | null>(null);
  /** Evita que el efecto de poda borre «a sacar»/adicionales mientras cargan los ingredientes. */
  const hydratingIngredientsRef = useRef(false);
  const paymentIdsKey = acceptedPaymentIds.join("|");

  const removableSet = useMemo(() => new Set(removableIds), [removableIds]);
  const additionalOptions = useMemo(
    () => ingredients.filter((i) => !removableSet.has(i.id)),
    [ingredients, removableSet],
  );
  const showRemovableSection = hasIngredients && ingredients.length >= 2;
  const additionalCurrencyLabel = currencyLabelForId(visualCurrencyId, currencyExtras);

  useEffect(() => {
    if (!open) {
      formSessionRef.current = null;
      hydratingIngredientsRef.current = false;
      return;
    }

    const session = `${product ? `edit:${product.id}` : "create"}:${paymentIdsKey}`;
    if (formSessionRef.current === session) return;
    formSessionRef.current = session;

    if (product) {
      setName(product.name);
      setDescription(product.description ?? "");
      const nextPrices = emptyPrices(acceptedPaymentIds);
      const saved = product.pricesByCurrency ?? {};
      for (const id of acceptedPaymentIds) {
        if (saved[id] != null) nextPrices[id] = String(saved[id]);
        else if (id === (product.displayCurrencyId ?? visualCurrencyId)) {
          nextPrices[id] = String(product.price);
        } else if (id === STORE_CURRENCY_USD_ID && product.price > 0 && !saved[id]) {
          nextPrices[id] = String(product.price);
        }
      }
      setPrices(nextPrices);
      const ids = product.ingredientMaterialIds ?? [];
      const removable = product.removableIngredientMaterialIds ?? [];
      const savedAdditionals = product.ingredientAdditionals ?? [];
      hydratingIngredientsRef.current = ids.length > 0;
      setHasIngredients(ids.length > 0);
      setRemovableIds(removable);
      setHasAdditionals(savedAdditionals.length > 0);
      setAdditionals(
        savedAdditionals.map((a) => ({
          ingredientMaterialId: a.ingredientMaterialId,
          price: String(a.price),
        })),
      );
      // Placeholders síncronos para que la poda no vacíe la selección antes de resolver nombres.
      setIngredients(ids.map((id) => ({ id, name: `Item #${id}` })));
      setResolving(ids.length > 0);
      if (ids.length === 0) {
        hydratingIngredientsRef.current = false;
      } else {
        void resolveIngredientNames(ids)
          .then((resolved) => {
            setIngredients(resolved);
          })
          .catch(() => {
            setIngredients(ids.map((id) => ({ id, name: `Item #${id}` })));
          })
          .finally(() => {
            hydratingIngredientsRef.current = false;
            setResolving(false);
          });
      }
      setImageDrafts(draftsFromSavedUrls(product.imageUrls ?? []));
      setCategories(categoriesFromIds(allCategories, product.categoryIds ?? []));
    } else {
      hydratingIngredientsRef.current = false;
      setName("");
      setDescription("");
      setPrices(emptyPrices(acceptedPaymentIds));
      setHasIngredients(false);
      setIngredients([]);
      setRemovableIds([]);
      setHasAdditionals(false);
      setAdditionals([]);
      setCategories([]);
      setImageDrafts([]);
      setResolving(false);
    }
  }, [open, product, allCategories, acceptedPaymentIds, paymentIdsKey, visualCurrencyId]);

  useEffect(() => {
    if (!open || allCategories.length === 0) return;
    setCategories((prev) => {
      const map = new Map(allCategories.map((c) => [c.id, c.name]));
      return prev.map((p) => ({ id: p.id, name: map.get(p.id) ?? p.name }));
    });
  }, [open, allCategories]);

  /** Mantener removibles/adicionales coherentes con la lista base. */
  useEffect(() => {
    if (hydratingIngredientsRef.current || resolving) return;
    if (!hasIngredients) {
      setRemovableIds([]);
      setHasAdditionals(false);
      setAdditionals([]);
      return;
    }
    const ids = new Set(ingredients.map((i) => i.id));
    setRemovableIds((prev) => {
      const next = ingredients.length < 2 ? [] : prev.filter((id) => ids.has(id));
      if (next.length === prev.length && next.every((id, i) => id === prev[i])) return prev;
      return next;
    });
    setAdditionals((prev) => {
      const next = prev.filter((a) => ids.has(a.ingredientMaterialId));
      if (
        next.length === prev.length &&
        next.every((a, i) => a.ingredientMaterialId === prev[i]?.ingredientMaterialId)
      ) {
        return prev;
      }
      return next;
    });
  }, [hasIngredients, ingredients, resolving]);

  /** Si un material pasa a «a sacar», sale de adicionales. */
  useEffect(() => {
    if (!hasAdditionals) return;
    setAdditionals((prev) => {
      const next = prev.filter((a) => !removableSet.has(a.ingredientMaterialId));
      if (next.length === prev.length) return prev;
      return next;
    });
  }, [hasAdditionals, removableSet]);

  function handleIngredientsChange(next: SelectedIngredient[]) {
    setIngredients(next);
    const nextIds = new Set(next.map((i) => i.id));
    setRemovableIds((prev) => prev.filter((id) => nextIds.has(id)));
    setAdditionals((prev) =>
      prev.filter((a) => nextIds.has(a.ingredientMaterialId)),
    );
  }

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
    if (!trimmedName) {
      toast({ variant: "destructive", title: "Nombre obligatorio" });
      return;
    }

    const pricesByCurrency: Record<string, number> = {};
    for (const id of acceptedPaymentIds) {
      const raw = (prices[id] ?? "").trim().replace(",", ".");
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0) {
        toast({
          variant: "destructive",
          title: "Precio inválido",
          description: `Ingresa un precio mayor a 0 para ${currencyLabelForId(id, currencyExtras)}.`,
        });
        return;
      }
      pricesByCurrency[id] = n;
    }

    const visualPrice =
      pricesByCurrency[visualCurrencyId] ??
      pricesByCurrency[STORE_CURRENCY_USD_ID] ??
      Object.values(pricesByCurrency)[0];

    const baseIngredientIds = hasIngredients ? ingredients.map((i) => i.id) : [];
    const nextRemovable =
      hasIngredients && baseIngredientIds.length >= 2
        ? removableIds.filter((id) => baseIngredientIds.includes(id))
        : [];
    const removableForbidden = new Set(nextRemovable);

    let nextAdditionals: { ingredientMaterialId: number; price: number }[] = [];
    if (hasIngredients && hasAdditionals) {
      for (const row of additionals) {
        if (!baseIngredientIds.includes(row.ingredientMaterialId)) continue;
        if (removableForbidden.has(row.ingredientMaterialId)) {
          toast({
            variant: "destructive",
            title: "Adicional inválido",
            description: "Un adicional no puede estar también en «a sacar».",
          });
          return;
        }
        const n = Number(String(row.price).trim().replace(",", "."));
        if (!Number.isFinite(n) || n <= 0) {
          const label =
            ingredients.find((i) => i.id === row.ingredientMaterialId)?.name ??
            `Item #${row.ingredientMaterialId}`;
          toast({
            variant: "destructive",
            title: "Precio de adicional inválido",
            description: `Indica un precio mayor a 0 para «${label}».`,
          });
          return;
        }
        nextAdditionals.push({ ingredientMaterialId: row.ingredientMaterialId, price: n });
      }
    }

    try {
      const imageUrls = await resolveImageUrlsFromDrafts(imageDrafts);
      const payload = {
        name: trimmedName,
        description: description.trim() || null,
        price: visualPrice,
        pricesByCurrency,
        categoryIds: categories.map((c) => c.id),
        ingredientMaterialIds: baseIngredientIds,
        removableIngredientMaterialIds: nextRemovable,
        ingredientAdditionals: nextAdditionals,
        imageUrls,
        showOnShowcase: isEdit && product ? product.showOnShowcase : true,
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
      <DialogContent
        layer="elevated"
        shellClassName={storeAdminDialogShellClass}
        className={storeAdminDialogContentClass(
          "h-[min(92dvh,48rem)] max-h-[min(92dvh,48rem)] sm:max-h-[min(85dvh,48rem)]",
        )}
      >
        <DialogHeader className={storeAdminDialogHeaderClass}>
          <DialogTitle className="pr-8 font-display text-xl tracking-tight">
            {isEdit ? "Editar producto" : "Crear producto"}
          </DialogTitle>
          <DialogDescription>
            {isEdit ? "Modifica los datos del producto." : "Añade un producto al catálogo de tu tienda."}
          </DialogDescription>
        </DialogHeader>

        <form className="flex min-h-0 flex-1 flex-col" onSubmit={(e) => void handleSubmit(e)}>
          <div className={storeAdminDialogBodyClass}>
            <div className="space-y-2">
              <Label htmlFor="product-name">Nombre</Label>
              <Input
                id="product-name"
                className={storeAdminFieldClass}
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
                className={cn(storeAdminFieldClass, "h-auto min-h-[5.5rem] py-3")}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                maxLength={5000}
              />
            </div>

            <div className="space-y-3 rounded-2xl border border-border/70 bg-muted/20 p-3.5">
              <div>
                <p className="text-sm font-medium">Precios por moneda</p>
                <p className="text-xs text-muted-foreground">
                  Según las monedas marcadas en «Se acepta como pago».
                </p>
              </div>
              {acceptedPaymentIds.map((id) => {
                const label = currencyLabelForId(id, currencyExtras);
                return (
                  <div key={id} className="space-y-1.5">
                    <Label htmlFor={`product-price-${id}`}>Precio ({label})</Label>
                    <NumberField
                      id={`product-price-${id}`}
                      min="0.01"
                      step="0.01"
                      value={prices[id] ?? ""}
                      onChange={(next) => setPrices((prev) => ({ ...prev, [id]: next }))}
                      required
                    />
                  </div>
                );
              })}
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

            <div className="flex items-center justify-between gap-4 rounded-2xl border border-border/70 bg-muted/20 p-3.5">
              <div className="space-y-0.5">
                <Label htmlFor="product-has-ingredients">¿Tiene ingredientes o materiales?</Label>
                <p className="text-xs text-muted-foreground">Opcional. Selecciona de la lista global.</p>
              </div>
              <Switch
                id="product-has-ingredients"
                checked={hasIngredients}
                onCheckedChange={(checked) => {
                  setHasIngredients(checked);
                  if (!checked) {
                    setIngredients([]);
                    setRemovableIds([]);
                    setHasAdditionals(false);
                    setAdditionals([]);
                  }
                }}
              />
            </div>

            {hasIngredients ? (
              resolving ? (
                <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Cargando ingredientes…
                </div>
              ) : (
                <>
                  <IngredientMaterialPicker selected={ingredients} onChange={handleIngredientsChange} />

                  {showRemovableSection ? (
                    <div className="space-y-2 rounded-2xl border border-border/70 bg-muted/20 p-3.5">
                      <div>
                        <p className="text-sm font-medium">Ingredientes o materiales a sacar</p>
                        <p className="text-xs text-muted-foreground">
                          Elige cuáles de los ya añadidos podrá quitar el cliente.
                        </p>
                      </div>
                      <ProductRemovableIngredientsPicker
                        options={ingredients}
                        selectedIds={removableIds}
                        onChange={(ids) => {
                          setRemovableIds(ids);
                          const blocked = new Set(ids);
                          setAdditionals((prev) =>
                            prev.filter((a) => !blocked.has(a.ingredientMaterialId)),
                          );
                        }}
                        disabled={saving}
                      />
                    </div>
                  ) : ingredients.length === 1 ? (
                    <p className="px-0.5 text-xs text-muted-foreground">
                      Añade al menos 2 ingredientes o materiales para configurar cuáles se pueden sacar.
                    </p>
                  ) : null}

                  <div className="flex items-center justify-between gap-4 rounded-2xl border border-border/70 bg-muted/20 p-3.5">
                    <div className="space-y-0.5">
                      <Label htmlFor="product-has-additionals">Adicionales</Label>
                      <p className="text-xs text-muted-foreground">
                        Opcional. Extras con precio; no pueden estar en «a sacar».
                      </p>
                    </div>
                    <Switch
                      id="product-has-additionals"
                      checked={hasAdditionals}
                      disabled={saving || ingredients.length === 0}
                      onCheckedChange={(checked) => {
                        setHasAdditionals(checked);
                        if (!checked) setAdditionals([]);
                      }}
                    />
                  </div>

                  {hasAdditionals ? (
                    <ProductIngredientAdditionalsEditor
                      options={additionalOptions}
                      value={additionals}
                      onChange={setAdditionals}
                      disabled={saving}
                      currencyLabel={additionalCurrencyLabel}
                    />
                  ) : null}
                </>
              )
            ) : null}
          </div>

          <DialogFooter className={storeAdminDialogFooterClass}>
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-full"
              onClick={() => handleOpenChange(false)}
              disabled={saving}
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
