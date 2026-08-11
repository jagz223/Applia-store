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
  emptyAdditionalDraft,
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

type SizeDraft = {
  id: string;
  name: string;
  prices: Record<string, string>;
};

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

function newSizeId(): string {
  return `sz_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function parsePositivePrice(raw: string): number | null {
  const n = Number(String(raw).trim().replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function resizeSizeDrafts(
  prev: SizeDraft[],
  count: number,
  acceptedPaymentIds: string[],
): SizeDraft[] {
  const next = prev.slice(0, count).map((s) => ({
    ...s,
    prices: { ...emptyPrices(acceptedPaymentIds), ...s.prices },
  }));
  while (next.length < count) {
    next.push({ id: newSizeId(), name: "", prices: emptyPrices(acceptedPaymentIds) });
  }
  return next;
}

function hydrateAdditionalsFromProduct(
  saved: NonNullable<StoreProductSummary["ingredientAdditionals"]>,
  acceptedPaymentIds: string[],
  sizeIds: string[],
  visualCurrencyId: string,
): ProductIngredientAdditionalDraft[] {
  return saved.map((a) => {
    const draft = emptyAdditionalDraft(a.ingredientMaterialId, acceptedPaymentIds, sizeIds);
    if (sizeIds.length > 0) {
      for (const sizeId of sizeIds) {
        const map = a.pricesBySize?.[sizeId] ?? {};
        for (const currencyId of acceptedPaymentIds) {
          if (map[currencyId] != null) {
            draft.pricesBySize[sizeId][currencyId] = String(map[currencyId]);
          } else if (currencyId === visualCurrencyId && a.price > 0 && Object.keys(map).length === 0) {
            draft.pricesBySize[sizeId][currencyId] = String(a.price);
          }
        }
      }
      return draft;
    }
    const map = a.pricesByCurrency ?? {};
    for (const currencyId of acceptedPaymentIds) {
      if (map[currencyId] != null) {
        draft.pricesByCurrency[currencyId] = String(map[currencyId]);
      } else if (currencyId === visualCurrencyId && a.price > 0) {
        draft.pricesByCurrency[currencyId] = String(a.price);
      }
    }
    return draft;
  });
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
  const [hasSizes, setHasSizes] = useState(false);
  const [sizeCountInput, setSizeCountInput] = useState("2");
  const [sizeDrafts, setSizeDrafts] = useState<SizeDraft[]>([]);
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
  const sizeCount = Math.max(0, Math.floor(Number(sizeCountInput) || 0));
  const namedSizes = sizeDrafts.map((s) => ({ id: s.id, name: s.name.trim() || "Tamaño" }));
  const sizeIdsKey = sizeDrafts.map((s) => s.id).join("|");

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
      const savedSizes = product.sizes ?? [];
      if (savedSizes.length > 0) {
        setHasSizes(true);
        setSizeCountInput(String(savedSizes.length));
        setSizeDrafts(
          savedSizes.map((s) => {
            const nextPrices = emptyPrices(acceptedPaymentIds);
            const saved = s.pricesByCurrency ?? {};
            for (const id of acceptedPaymentIds) {
              if (saved[id] != null) nextPrices[id] = String(saved[id]);
            }
            return { id: s.id, name: s.name, prices: nextPrices };
          }),
        );
        setPrices(emptyPrices(acceptedPaymentIds));
      } else {
        setHasSizes(false);
        setSizeCountInput("2");
        setSizeDrafts([]);
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
      }
      const ids = product.ingredientMaterialIds ?? [];
      const removable = product.removableIngredientMaterialIds ?? [];
      const savedAdditionals = product.ingredientAdditionals ?? [];
      const sizeIds = savedSizes.map((s) => s.id);
      hydratingIngredientsRef.current = ids.length > 0;
      setHasIngredients(ids.length > 0);
      setRemovableIds(removable);
      setHasAdditionals(savedAdditionals.length > 0);
      setAdditionals(
        hydrateAdditionalsFromProduct(
          savedAdditionals,
          acceptedPaymentIds,
          sizeIds,
          visualCurrencyId,
        ),
      );
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
      setHasSizes(false);
      setSizeCountInput("2");
      setSizeDrafts([]);
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

  /** Mantener la cantidad de borradores de tamaño alineada con el número indicado. */
  useEffect(() => {
    if (!open || !hasSizes) return;
    if (sizeCount < 2 || sizeCount > 20) return;
    setSizeDrafts((prev) => {
      if (prev.length === sizeCount) return prev;
      return resizeSizeDrafts(prev, sizeCount, acceptedPaymentIds);
    });
  }, [open, hasSizes, sizeCount, acceptedPaymentIds]);

  /** Si cambian los ids de tamaño, re-sincronizar precios de adicionales. */
  useEffect(() => {
    if (!hasAdditionals || !hasSizes || !sizeIdsKey) return;
    const sizeIds = sizeIdsKey.split("|").filter(Boolean);
    setAdditionals((prev) =>
      prev.map((row) => {
        const nextSizes: Record<string, Record<string, string>> = {};
        for (const sizeId of sizeIds) {
          nextSizes[sizeId] = {
            ...emptyPrices(acceptedPaymentIds),
            ...(row.pricesBySize[sizeId] ?? {}),
          };
        }
        return { ...row, pricesBySize: nextSizes, pricesByCurrency: {} };
      }),
    );
  }, [hasAdditionals, hasSizes, sizeIdsKey, acceptedPaymentIds]);

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

    let pricesByCurrency: Record<string, number> = {};
    let sizesPayload: { id: string; name: string; pricesByCurrency: Record<string, number> }[] = [];

    if (hasSizes) {
      if (sizeCount < 2 || sizeCount > 20 || sizeDrafts.length !== sizeCount) {
        toast({
          variant: "destructive",
          title: "Tamaños inválidos",
          description: "Indica entre 2 y 20 tamaños.",
        });
        return;
      }
      for (const draft of sizeDrafts) {
        const sizeName = draft.name.trim();
        if (!sizeName) {
          toast({
            variant: "destructive",
            title: "Nombre de tamaño obligatorio",
            description: "Pon un nombre a cada tamaño (ej. Pequeño, Estándar, Grande).",
          });
          return;
        }
        const sizePrices: Record<string, number> = {};
        for (const id of acceptedPaymentIds) {
          const n = parsePositivePrice(draft.prices[id] ?? "");
          if (n == null) {
            toast({
              variant: "destructive",
              title: "Precio inválido",
              description: `Ingresa un precio mayor a 0 para «${sizeName}» en ${currencyLabelForId(id, currencyExtras)}.`,
            });
            return;
          }
          sizePrices[id] = n;
        }
        sizesPayload.push({ id: draft.id, name: sizeName, pricesByCurrency: sizePrices });
      }
      // Precio de listado = mínimo en moneda visual
      let minVisual = Infinity;
      let minMap: Record<string, number> = sizesPayload[0]?.pricesByCurrency ?? {};
      for (const size of sizesPayload) {
        const visual = size.pricesByCurrency[visualCurrencyId] ?? Object.values(size.pricesByCurrency)[0];
        if (visual < minVisual) {
          minVisual = visual;
          minMap = size.pricesByCurrency;
        }
      }
      pricesByCurrency = { ...minMap };
    } else {
      for (const id of acceptedPaymentIds) {
        const n = parsePositivePrice(prices[id] ?? "");
        if (n == null) {
          toast({
            variant: "destructive",
            title: "Precio inválido",
            description: `Ingresa un precio mayor a 0 para ${currencyLabelForId(id, currencyExtras)}.`,
          });
          return;
        }
        pricesByCurrency[id] = n;
      }
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

    type AdditionalPayload = {
      ingredientMaterialId: number;
      price: number;
      pricesByCurrency: Record<string, number>;
      pricesBySize: Record<string, Record<string, number>>;
    };
    let nextAdditionals: AdditionalPayload[] = [];
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
        const label =
          ingredients.find((i) => i.id === row.ingredientMaterialId)?.name ??
          `Item #${row.ingredientMaterialId}`;

        if (hasSizes) {
          const pricesBySize: Record<string, Record<string, number>> = {};
          let visualFallback = 0;
          for (const size of sizesPayload) {
            const sizeMap: Record<string, number> = {};
            for (const currencyId of acceptedPaymentIds) {
              const n = parsePositivePrice(row.pricesBySize[size.id]?.[currencyId] ?? "");
              if (n == null) {
                toast({
                  variant: "destructive",
                  title: "Precio de adicional inválido",
                  description: `Indica un precio mayor a 0 para «${label}» (${size.name}) en ${currencyLabelForId(currencyId, currencyExtras)}.`,
                });
                return;
              }
              sizeMap[currencyId] = n;
            }
            pricesBySize[size.id] = sizeMap;
            if (!visualFallback) {
              visualFallback =
                sizeMap[visualCurrencyId] ?? sizeMap[STORE_CURRENCY_USD_ID] ?? Object.values(sizeMap)[0];
            }
          }
          nextAdditionals.push({
            ingredientMaterialId: row.ingredientMaterialId,
            price: visualFallback,
            pricesByCurrency: {},
            pricesBySize,
          });
        } else {
          const map: Record<string, number> = {};
          for (const currencyId of acceptedPaymentIds) {
            const n = parsePositivePrice(row.pricesByCurrency[currencyId] ?? "");
            if (n == null) {
              toast({
                variant: "destructive",
                title: "Precio de adicional inválido",
                description: `Indica un precio mayor a 0 para «${label}» en ${currencyLabelForId(currencyId, currencyExtras)}.`,
              });
              return;
            }
            map[currencyId] = n;
          }
          nextAdditionals.push({
            ingredientMaterialId: row.ingredientMaterialId,
            price:
              map[visualCurrencyId] ?? map[STORE_CURRENCY_USD_ID] ?? Object.values(map)[0],
            pricesByCurrency: map,
            pricesBySize: {},
          });
        }
      }
    }

    try {
      const imageUrls = await resolveImageUrlsFromDrafts(imageDrafts);
      const payload = {
        name: trimmedName,
        description: description.trim() || null,
        price: visualPrice,
        pricesByCurrency,
        sizes: hasSizes ? sizesPayload : [],
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

            <div className="flex items-center justify-between gap-4 rounded-2xl border border-border/70 bg-muted/20 p-3.5">
              <div className="space-y-0.5">
                <Label htmlFor="product-has-sizes">¿Viene en varios tamaños?</Label>
                <p className="text-xs text-muted-foreground">
                  Si está activo, el precio se define por cada tamaño y moneda.
                </p>
              </div>
              <Switch
                id="product-has-sizes"
                checked={hasSizes}
                disabled={saving}
                onCheckedChange={(checked) => {
                  setHasSizes(checked);
                  if (checked) {
                    const count = Math.max(2, Math.min(20, sizeCount || 2));
                    setSizeCountInput(String(count));
                    setSizeDrafts((prev) =>
                      prev.length >= 2
                        ? resizeSizeDrafts(prev, count, acceptedPaymentIds)
                        : resizeSizeDrafts([], count, acceptedPaymentIds),
                    );
                    setPrices(emptyPrices(acceptedPaymentIds));
                  } else {
                    setSizeDrafts([]);
                    setAdditionals((prev) =>
                      prev.map((row) =>
                        emptyAdditionalDraft(row.ingredientMaterialId, acceptedPaymentIds, []),
                      ),
                    );
                  }
                }}
              />
            </div>

            {hasSizes ? (
              <div className="space-y-3 rounded-2xl border border-border/70 bg-muted/20 p-3.5">
                <div className="space-y-1.5">
                  <Label htmlFor="product-size-count">¿Cuántos tamaños puede tener?</Label>
                  <NumberField
                    id="product-size-count"
                    min="2"
                    max="20"
                    step="1"
                    value={sizeCountInput}
                    onChange={setSizeCountInput}
                    disabled={saving}
                    required
                  />
                  <p className="text-xs text-muted-foreground">Entre 2 y 20.</p>
                </div>

                {sizeCount >= 2 && sizeCount <= 20 ? (
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-medium">Nombres de los tamaños</p>
                      <p className="text-xs text-muted-foreground">
                        Ejemplo: Pequeño, Estándar, Grande.
                      </p>
                    </div>
                    {sizeDrafts.map((draft, index) => (
                      <div key={draft.id} className="space-y-1.5">
                        <Label htmlFor={`product-size-name-${draft.id}`}>
                          Tamaño {index + 1}
                        </Label>
                        <Input
                          id={`product-size-name-${draft.id}`}
                          className={storeAdminFieldClass}
                          value={draft.name}
                          maxLength={80}
                          disabled={saving}
                          placeholder={
                            index === 0
                              ? "Pequeño"
                              : index === 1
                                ? "Estándar"
                                : index === 2
                                  ? "Grande"
                                  : `Tamaño ${index + 1}`
                          }
                          onChange={(e) =>
                            setSizeDrafts((prev) =>
                              prev.map((s) =>
                                s.id === draft.id ? { ...s, name: e.target.value } : s,
                              ),
                            )
                          }
                          required
                        />
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {hasSizes && sizeCount >= 2 && sizeCount <= 20 ? (
              sizeDrafts.map((draft) => {
                const sizeLabel = draft.name.trim() || "Tamaño";
                return (
                  <div
                    key={`prices-${draft.id}`}
                    className="space-y-3 rounded-2xl border border-border/70 bg-muted/20 p-3.5"
                  >
                    <div>
                      <p className="text-sm font-medium">Precios — {sizeLabel}</p>
                      <p className="text-xs text-muted-foreground">
                        Según las monedas marcadas en «Se acepta como pago».
                      </p>
                    </div>
                    {acceptedPaymentIds.map((id) => {
                      const label = currencyLabelForId(id, currencyExtras);
                      return (
                        <div key={id} className="space-y-1.5">
                          <Label htmlFor={`product-price-${draft.id}-${id}`}>
                            Precio ({label})
                          </Label>
                          <NumberField
                            id={`product-price-${draft.id}-${id}`}
                            min="0.01"
                            step="0.01"
                            value={draft.prices[id] ?? ""}
                            onChange={(next) =>
                              setSizeDrafts((prev) =>
                                prev.map((s) =>
                                  s.id === draft.id
                                    ? { ...s, prices: { ...s.prices, [id]: next } }
                                    : s,
                                ),
                              )
                            }
                            required
                          />
                        </div>
                      );
                    })}
                  </div>
                );
              })
            ) : !hasSizes ? (
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
            ) : null}

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
                        {hasSizes
                          ? "Extras con precio por tamaño y moneda; no pueden estar en «a sacar»."
                          : "Extras con precio por moneda; no pueden estar en «a sacar»."}
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
                      acceptedPaymentIds={acceptedPaymentIds}
                      currencyExtras={currencyExtras}
                      sizes={hasSizes ? namedSizes : []}
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
