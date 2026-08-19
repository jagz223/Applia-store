import { useEffect, useState } from "react";
import { Info, Loader2, Plus, Trash2 } from "lucide-react";
import {
  STORE_FULFILLMENT_CUSTOMER_HINTS,
  STORE_FULFILLMENT_DESCRIPTIONS,
  STORE_FULFILLMENT_LABELS,
  STORE_FULFILLMENT_MODES,
  type StoreFulfillmentMode,
} from "@shared/store-fulfillment";
import {
  DEFAULT_STORE_DELIVERY_FARES,
  STORE_FULFILLMENT_REQUIRES_LOCATION_MESSAGE,
  normalizeStoreDeliveryFares,
  storeHasConfiguredLocation,
  type StoreBranch,
  type StoreDeliveryCostTier,
  type StoreDeliveryFares,
  type StoreDeliverySurchargeMode,
  type StoreLocation,
} from "@shared/store-schema";
import { useUpdateStore } from "@/hooks/use-store-settings";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { NumberField } from "@/components/ui/number-field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  storeAdminDialogContentClass,
  storeAdminDialogFooterClass,
  storeAdminDialogHeaderClass,
  storeAdminDialogShellClass,
  storeAdminSectionCardClass,
} from "@/components/store/store-admin-ui";
import { cn } from "@/lib/utils";

type ExtraTierDraft = {
  id: string;
  minValue: string;
  priceUsd: string;
};

type StoreFulfillmentConfigCardProps = {
  storeId: number;
  slug: string;
  initialOptions: StoreFulfillmentMode[];
  initialDeliveryFares?: StoreDeliveryFares | null;
  storeLocation: StoreLocation | null;
  storeBranches?: StoreBranch[] | null;
  disabled?: boolean;
};

function newTierId(): string {
  return `tier_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function parseMoneyUsd(raw: string): number | null {
  const n = Number(String(raw).trim().replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function parseTierMinValue(raw: string, mode: StoreDeliverySurchargeMode): number | null {
  const n = Number(String(raw).trim().replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  if (mode === "quantity") {
    const i = Math.floor(n);
    return i >= 1 ? i : null;
  }
  return Math.round((Math.min(n, 1_000_000) + Number.EPSILON) * 1000) / 1000;
}

function splitFaresDraft(fares: StoreDeliveryFares): {
  surchargeMode: StoreDeliverySurchargeMode;
  defaultPriceUsd: string;
  perKmUsd: string;
  extraTiers: ExtraTierDraft[];
} {
  const defaultTier = fares.costTiers.find((t) => t.minValue === 0) ?? fares.costTiers[0];
  return {
    surchargeMode: fares.surchargeMode,
    defaultPriceUsd: String(defaultTier?.priceUsd ?? fares.baseUsd),
    perKmUsd: String(fares.perKmUsd),
    extraTiers: fares.costTiers
      .filter((t) => t.minValue > 0)
      .map((t) => ({
        id: t.id,
        minValue: String(t.minValue),
        priceUsd: String(t.priceUsd),
      })),
  };
}

export function StoreFulfillmentConfigCard({
  storeId,
  slug,
  initialOptions,
  initialDeliveryFares,
  storeLocation,
  storeBranches,
  disabled,
}: StoreFulfillmentConfigCardProps) {
  const { toast } = useToast();
  const updateStore = useUpdateStore(storeId, slug);

  const [savedOptions, setSavedOptions] = useState<StoreFulfillmentMode[]>(initialOptions);
  const [selected, setSelected] = useState<StoreFulfillmentMode[]>(initialOptions);
  const [savedFares, setSavedFares] = useState<StoreDeliveryFares>(() =>
    normalizeStoreDeliveryFares(initialDeliveryFares ?? DEFAULT_STORE_DELIVERY_FARES),
  );
  const initialDraft = splitFaresDraft(savedFares);
  const [surchargeMode, setSurchargeMode] = useState<StoreDeliverySurchargeMode>(
    initialDraft.surchargeMode,
  );
  const [defaultPriceUsd, setDefaultPriceUsd] = useState(initialDraft.defaultPriceUsd);
  const [perKmUsd, setPerKmUsd] = useState(initialDraft.perKmUsd);
  const [extraTiers, setExtraTiers] = useState<ExtraTierDraft[]>(initialDraft.extraTiers);
  const [explainMode, setExplainMode] = useState<StoreFulfillmentMode | null>(null);

  const hasStoreLocation = storeHasConfiguredLocation(storeBranches, storeLocation);
  const deliveryEnabled = selected.includes("delivery");
  const thresholdLabel = surchargeMode === "weight" ? "A partir de (kg)" : "A partir de (artículos)";
  const thresholdHint =
    surchargeMode === "weight"
      ? "Se usa el umbral más alto cuyo peso mínimo el carrito cumple."
      : "Se usa el umbral más alto cuya cantidad mínima el carrito cumple.";

  function applyFaresToDraft(next: StoreDeliveryFares) {
    const draft = splitFaresDraft(next);
    setSurchargeMode(draft.surchargeMode);
    setDefaultPriceUsd(draft.defaultPriceUsd);
    setPerKmUsd(draft.perKmUsd);
    setExtraTiers(draft.extraTiers);
  }

  useEffect(() => {
    setSavedOptions(initialOptions);
    setSelected(initialOptions);
  }, [initialOptions]);

  useEffect(() => {
    const next = normalizeStoreDeliveryFares(initialDeliveryFares ?? DEFAULT_STORE_DELIVERY_FARES);
    setSavedFares(next);
    applyFaresToDraft(next);
  }, [initialDeliveryFares]);

  const savedSplit = splitFaresDraft(savedFares);
  const faresDirty =
    deliveryEnabled &&
    (surchargeMode !== savedSplit.surchargeMode ||
      defaultPriceUsd !== savedSplit.defaultPriceUsd ||
      perKmUsd !== savedSplit.perKmUsd ||
      extraTiers.length !== savedSplit.extraTiers.length ||
      extraTiers.some((row, i) => {
        const saved = savedSplit.extraTiers[i];
        return !saved || row.minValue !== saved.minValue || row.priceUsd !== saved.priceUsd;
      }));

  const optionsDirty =
    selected.length !== savedOptions.length ||
    STORE_FULFILLMENT_MODES.some((mode) => selected.includes(mode) !== savedOptions.includes(mode));

  const dirty = optionsDirty || Boolean(faresDirty);

  function warnLocationRequired() {
    toast({
      variant: "destructive",
      title: "Ubicación requerida",
      description: STORE_FULFILLMENT_REQUIRES_LOCATION_MESSAGE,
    });
  }

  function isChecked(mode: StoreFulfillmentMode) {
    return selected.includes(mode);
  }

  function handleToggle(mode: StoreFulfillmentMode, next: boolean) {
    if (next) {
      if (!hasStoreLocation) {
        warnLocationRequired();
        return;
      }
      setExplainMode(mode);
      return;
    }
    setSelected((prev) => prev.filter((m) => m !== mode));
  }

  function confirmEnableMode() {
    if (!explainMode) return;
    if (!hasStoreLocation) {
      warnLocationRequired();
      setExplainMode(null);
      return;
    }
    setSelected((prev) => (prev.includes(explainMode) ? prev : [...prev, explainMode]));
    setExplainMode(null);
  }

  function discardChanges() {
    setSelected(savedOptions);
    applyFaresToDraft(savedFares);
  }

  function addExtraTier() {
    if (extraTiers.length >= 49) return;
    setExtraTiers((prev) => [...prev, { id: newTierId(), minValue: "", priceUsd: "" }]);
  }

  function updateExtraTier(id: string, patch: Partial<ExtraTierDraft>) {
    setExtraTiers((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function removeExtraTier(id: string) {
    setExtraTiers((prev) => prev.filter((row) => row.id !== id));
  }

  async function handleSave() {
    if (selected.length > 0 && !hasStoreLocation) {
      warnLocationRequired();
      return;
    }

    let nextFares = savedFares;
    if (selected.includes("delivery")) {
      const defaultPrice = parseMoneyUsd(defaultPriceUsd);
      const perKm = parseMoneyUsd(perKmUsd);
      if (defaultPrice == null || perKm == null) {
        toast({
          variant: "destructive",
          title: "Tarifas inválidas",
          description: "Indica precios válidos (0 o mayor) para el coste por defecto y el precio por km.",
        });
        return;
      }
      const seen = new Set<number>([0]);
      const costTiers: StoreDeliveryCostTier[] = [
        { id: "default", minValue: 0, priceUsd: defaultPrice },
      ];
      for (let i = 0; i < extraTiers.length; i += 1) {
        const row = extraTiers[i];
        const minValue = parseTierMinValue(row.minValue, surchargeMode);
        const priceUsd = parseMoneyUsd(row.priceUsd);
        if (minValue == null) {
          toast({
            variant: "destructive",
            title: "Umbral inválido",
            description:
              surchargeMode === "weight"
                ? `El coste ${i + 2} necesita un peso mínimo mayor a 0 kg.`
                : `El coste ${i + 2} necesita una cantidad mínima de 1 artículo o más.`,
          });
          return;
        }
        if (priceUsd == null) {
          toast({
            variant: "destructive",
            title: "Precio inválido",
            description: `Indica un precio válido para el coste ${i + 2}.`,
          });
          return;
        }
        if (seen.has(minValue)) {
          toast({
            variant: "destructive",
            title: "Umbral repetido",
            description: "Cada coste debe tener un umbral distinto.",
          });
          return;
        }
        seen.add(minValue);
        costTiers.push({ id: row.id.trim() || newTierId(), minValue, priceUsd });
      }
      nextFares = normalizeStoreDeliveryFares({
        baseUsd: defaultPrice,
        perKmUsd: perKm,
        surchargeMode,
        costTiers,
      });
    }

    try {
      const store = await updateStore.mutateAsync({
        fulfillmentOptions: selected,
        ...(selected.includes("delivery") ? { deliveryFares: nextFares } : {}),
      });
      const nextOptions = store.fulfillmentOptions ?? selected;
      setSavedOptions(nextOptions);
      setSelected(nextOptions);
      if (store.deliveryFares) {
        const fares = normalizeStoreDeliveryFares(store.deliveryFares);
        setSavedFares(fares);
        applyFaresToDraft(fares);
      } else if (selected.includes("delivery")) {
        setSavedFares(nextFares);
        applyFaresToDraft(nextFares);
      }
      toast({
        title: "Modalidades guardadas",
        description: "Los clientes verán estas opciones en el carrito.",
      });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "No se pudo guardar",
        description: e instanceof Error ? e.message : "Error desconocido",
      });
    }
  }

  const saving = updateStore.isPending;

  return (
    <>
      <Card className={cn(storeAdminSectionCardClass, "overflow-hidden")}>
        <CardHeader>
          <CardTitle className="font-display">Modalidades de entrega</CardTitle>
          <CardDescription>
            Elige qué opciones estarán disponibles en el carrito. El cliente solo podrá elegir una.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!hasStoreLocation ? (
            <p className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              Debes registrar la ubicación de la tienda antes de activar modalidades de entrega.
            </p>
          ) : null}

          <div className="space-y-3">
            {STORE_FULFILLMENT_MODES.map((mode) => (
              <div key={mode} className="min-w-0 space-y-3">
                <div className="flex items-start gap-3 rounded-2xl border border-border/70 px-3 py-3">
                  <Checkbox
                    id={`fulfillment-${mode}`}
                    checked={isChecked(mode)}
                    disabled={disabled || saving || (!hasStoreLocation && !isChecked(mode))}
                    onCheckedChange={(v) => handleToggle(mode, v === true)}
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <Label htmlFor={`fulfillment-${mode}`} className="cursor-pointer font-medium">
                      {STORE_FULFILLMENT_LABELS[mode]}
                    </Label>
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {STORE_FULFILLMENT_CUSTOMER_HINTS[mode]}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                    aria-label={`Más información sobre ${STORE_FULFILLMENT_LABELS[mode]}`}
                    disabled={disabled || saving}
                    onClick={() => setExplainMode(mode)}
                  >
                    <Info className="h-4 w-4" />
                  </button>
                </div>

                {mode === "delivery" && deliveryEnabled ? (
                  <div className="min-w-0 space-y-4 rounded-2xl border border-border/70 bg-muted/25 p-3.5 sm:ml-6">
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-foreground">Precios del delivery</p>
                      <p className="text-xs text-muted-foreground">
                        El total es: coste según umbral + (km × precio por km). El umbral reemplaza el
                        precio base; el km se suma igual.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs">¿Cómo se elige el coste?</Label>
                      <RadioGroup
                        value={surchargeMode}
                        onValueChange={(v) =>
                          setSurchargeMode(v === "weight" ? "weight" : "quantity")
                        }
                        className="grid gap-2 sm:grid-cols-2"
                        disabled={disabled || saving}
                      >
                        <label
                          htmlFor="delivery-mode-quantity"
                          className="flex cursor-pointer items-start gap-2 rounded-xl border border-border/70 bg-background/60 px-3 py-2.5"
                        >
                          <RadioGroupItem
                            value="quantity"
                            id="delivery-mode-quantity"
                            disabled={disabled || saving}
                            className="mt-0.5"
                          />
                          <span className="space-y-0.5">
                            <span className="block text-sm font-medium">Por cantidad</span>
                            <span className="block text-xs text-muted-foreground">
                              Según cuántos artículos hay en el carrito.
                            </span>
                          </span>
                        </label>
                        <label
                          htmlFor="delivery-mode-weight"
                          className="flex cursor-pointer items-start gap-2 rounded-xl border border-border/70 bg-background/60 px-3 py-2.5"
                        >
                          <RadioGroupItem
                            value="weight"
                            id="delivery-mode-weight"
                            disabled={disabled || saving}
                            className="mt-0.5"
                          />
                          <span className="space-y-0.5">
                            <span className="block text-sm font-medium">Por peso</span>
                            <span className="block text-xs text-muted-foreground">
                              Según los kg de los productos con peso.
                            </span>
                          </span>
                        </label>
                      </RadioGroup>
                    </div>

                    <div className="min-w-0 space-y-1.5">
                      <Label htmlFor="delivery-per-km-usd" className="text-xs">
                        Precio por km (USD)
                      </Label>
                      <NumberField
                        id="delivery-per-km-usd"
                        prefix="$"
                        min="0"
                        step="0.01"
                        value={perKmUsd}
                        disabled={disabled || saving}
                        onChange={setPerKmUsd}
                      />
                    </div>

                    <div className="space-y-2">
                      <div>
                        <p className="text-xs font-medium text-foreground">Costes según umbral</p>
                        <p className="text-xs text-muted-foreground">
                          El coste 1 aplica si no se cumple ningún otro. {thresholdHint}
                        </p>
                      </div>

                      <div className="space-y-2 rounded-xl border border-border/70 bg-background/50 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium">Coste 1 (por defecto)</p>
                          <span className="text-[11px] text-muted-foreground">Siempre activo</span>
                        </div>
                        <div className="min-w-0 space-y-1.5">
                          <Label htmlFor="delivery-default-usd" className="text-xs">
                            Precio (USD)
                          </Label>
                          <NumberField
                            id="delivery-default-usd"
                            prefix="$"
                            min="0"
                            step="0.01"
                            value={defaultPriceUsd}
                            disabled={disabled || saving}
                            onChange={setDefaultPriceUsd}
                          />
                        </div>
                      </div>

                      {extraTiers.map((row, index) => (
                        <div
                          key={row.id}
                          className="space-y-2 rounded-xl border border-border/70 bg-background/50 p-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium">Coste {index + 2}</p>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                              disabled={disabled || saving}
                              aria-label={`Quitar coste ${index + 2}`}
                              onClick={() => removeExtraTier(row.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="min-w-0 space-y-1.5">
                              <Label htmlFor={`delivery-tier-min-${row.id}`} className="text-xs">
                                {thresholdLabel}
                              </Label>
                              <NumberField
                                id={`delivery-tier-min-${row.id}`}
                                min={surchargeMode === "quantity" ? "1" : "0.001"}
                                step={surchargeMode === "quantity" ? "1" : "0.001"}
                                value={row.minValue}
                                disabled={disabled || saving}
                                onChange={(next) => updateExtraTier(row.id, { minValue: next })}
                              />
                            </div>
                            <div className="min-w-0 space-y-1.5">
                              <Label htmlFor={`delivery-tier-price-${row.id}`} className="text-xs">
                                Precio (USD)
                              </Label>
                              <NumberField
                                id={`delivery-tier-price-${row.id}`}
                                prefix="$"
                                min="0"
                                step="0.01"
                                value={row.priceUsd}
                                disabled={disabled || saving}
                                onChange={(next) => updateExtraTier(row.id, { priceUsd: next })}
                              />
                            </div>
                          </div>
                        </div>
                      ))}

                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 w-full rounded-full"
                        disabled={disabled || saving || extraTiers.length >= 49}
                        onClick={addExtraTier}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Agregar coste
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          {selected.length === 0 ? (
            <p className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              Sin opciones activas, el carrito no mostrará modalidades de entrega.
            </p>
          ) : null}

          {dirty ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-border/70 pt-3">
              <Button
                type="button"
                className="h-11 rounded-full font-semibold"
                disabled={saving}
                onClick={() => void handleSave()}
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Guardar modalidades
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-full"
                disabled={saving}
                onClick={discardChanges}
              >
                Descartar
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={explainMode != null} onOpenChange={(open) => !open && setExplainMode(null)}>
        <DialogContent
          layer="elevated"
          shellClassName={storeAdminDialogShellClass}
          className={storeAdminDialogContentClass(
            "h-auto max-h-[min(92dvh,24rem)] sm:h-auto sm:max-h-[min(85dvh,24rem)]",
          )}
        >
          <DialogHeader className={storeAdminDialogHeaderClass}>
            <DialogTitle className="pr-8 font-display text-xl tracking-tight">
              {explainMode ? STORE_FULFILLMENT_LABELS[explainMode] : "Modalidad"}
            </DialogTitle>
            <DialogDescription>
              {explainMode ? STORE_FULFILLMENT_DESCRIPTIONS[explainMode] : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className={storeAdminDialogFooterClass}>
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-full"
              onClick={() => setExplainMode(null)}
            >
              Cerrar
            </Button>
            {explainMode && !isChecked(explainMode) ? (
              <Button
                type="button"
                className="h-11 rounded-full font-semibold"
                onClick={confirmEnableMode}
              >
                Activar esta opción
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
