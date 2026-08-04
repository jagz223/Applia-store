import { useEffect, useState } from "react";
import { Info, Loader2 } from "lucide-react";
import {
  STORE_FULFILLMENT_DESCRIPTIONS,
  STORE_FULFILLMENT_LABELS,
  STORE_FULFILLMENT_MODES,
  type StoreFulfillmentMode,
} from "@shared/store-fulfillment";
import {
  DEFAULT_STORE_DELIVERY_FARES,
  STORE_FULFILLMENT_REQUIRES_LOCATION_MESSAGE,
  normalizeStoreDeliveryFares,
  type StoreDeliveryFares,
  type StoreLocation,
} from "@shared/store-schema";
import { useUpdateStore } from "@/hooks/use-store-settings";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { NumberField } from "@/components/ui/number-field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type StoreFulfillmentConfigCardProps = {
  slug: string;
  initialOptions: StoreFulfillmentMode[];
  initialDeliveryFares?: StoreDeliveryFares | null;
  storeLocation: StoreLocation | null;
  disabled?: boolean;
};

export function StoreFulfillmentConfigCard({
  slug,
  initialOptions,
  initialDeliveryFares,
  storeLocation,
  disabled,
}: StoreFulfillmentConfigCardProps) {
  const { toast } = useToast();
  const updateStore = useUpdateStore(slug);

  const [savedOptions, setSavedOptions] = useState<StoreFulfillmentMode[]>(initialOptions);
  const [selected, setSelected] = useState<StoreFulfillmentMode[]>(initialOptions);
  const [savedFares, setSavedFares] = useState<StoreDeliveryFares>(() =>
    normalizeStoreDeliveryFares(initialDeliveryFares ?? DEFAULT_STORE_DELIVERY_FARES),
  );
  const [baseUsd, setBaseUsd] = useState(String(savedFares.baseUsd));
  const [perKmUsd, setPerKmUsd] = useState(String(savedFares.perKmUsd));
  const [explainMode, setExplainMode] = useState<StoreFulfillmentMode | null>(null);

  const hasStoreLocation = storeLocation != null;
  const deliveryEnabled = selected.includes("delivery");

  useEffect(() => {
    setSavedOptions(initialOptions);
    setSelected(initialOptions);
  }, [initialOptions]);

  useEffect(() => {
    const next = normalizeStoreDeliveryFares(initialDeliveryFares ?? DEFAULT_STORE_DELIVERY_FARES);
    setSavedFares(next);
    setBaseUsd(String(next.baseUsd));
    setPerKmUsd(String(next.perKmUsd));
  }, [initialDeliveryFares]);

  const draftFares: StoreDeliveryFares = {
    baseUsd: Number(String(baseUsd).replace(",", ".")),
    perKmUsd: Number(String(perKmUsd).replace(",", ".")),
  };

  const faresDirty =
    deliveryEnabled &&
    (Number.isFinite(draftFares.baseUsd) &&
      Number.isFinite(draftFares.perKmUsd) &&
      (draftFares.baseUsd !== savedFares.baseUsd || draftFares.perKmUsd !== savedFares.perKmUsd));

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
    setBaseUsd(String(savedFares.baseUsd));
    setPerKmUsd(String(savedFares.perKmUsd));
  }

  async function handleSave() {
    if (selected.length > 0 && !hasStoreLocation) {
      warnLocationRequired();
      return;
    }

    let nextFares = savedFares;
    if (selected.includes("delivery")) {
      const base = Number(String(baseUsd).replace(",", "."));
      const perKm = Number(String(perKmUsd).replace(",", "."));
      if (!Number.isFinite(base) || base < 0 || !Number.isFinite(perKm) || perKm < 0) {
        toast({
          variant: "destructive",
          title: "Tarifas inválidas",
          description: "Indica un precio base y un precio por km válidos (0 o mayor).",
        });
        return;
      }
      nextFares = normalizeStoreDeliveryFares({ baseUsd: base, perKmUsd: perKm });
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
        setBaseUsd(String(fares.baseUsd));
        setPerKmUsd(String(fares.perKmUsd));
      } else if (selected.includes("delivery")) {
        setSavedFares(nextFares);
        setBaseUsd(String(nextFares.baseUsd));
        setPerKmUsd(String(nextFares.perKmUsd));
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
      <Card>
        <CardHeader>
          <CardTitle>Modalidades de entrega</CardTitle>
          <CardDescription>
            Elige qué opciones estarán disponibles en el carrito. El cliente solo podrá elegir una.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!hasStoreLocation ? (
            <p className="text-xs text-amber-700 dark:text-amber-400 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2">
              Debes registrar la ubicación de la tienda antes de activar modalidades de entrega.
            </p>
          ) : null}

          <div className="space-y-3">
            {STORE_FULFILLMENT_MODES.map((mode) => (
              <div key={mode} className="space-y-3">
                <div className="flex items-start gap-3 rounded-lg border border-border px-3 py-3">
                  <Checkbox
                    id={`fulfillment-${mode}`}
                    checked={isChecked(mode)}
                    disabled={disabled || saving || (!hasStoreLocation && !isChecked(mode))}
                    onCheckedChange={(v) => handleToggle(mode, v === true)}
                  />
                  <div className="space-y-1 min-w-0 flex-1">
                    <Label htmlFor={`fulfillment-${mode}`} className="cursor-pointer font-medium">
                      {STORE_FULFILLMENT_LABELS[mode]}
                    </Label>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {STORE_FULFILLMENT_DESCRIPTIONS[mode]}
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
                  <div className="ml-8 space-y-3 rounded-lg border border-border/80 bg-muted/20 p-3.5">
                    <p className="text-xs font-medium text-foreground">Precios del delivery</p>
                    <p className="text-xs text-muted-foreground">
                      Se calculará como base + (km × precio por km) según la ruta hasta el cliente.
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="delivery-base-usd" className="text-xs">
                          Precio base (USD)
                        </Label>
                        <NumberField
                          id="delivery-base-usd"
                          prefix="$"
                          min="0"
                          step="0.01"
                          value={baseUsd}
                          disabled={disabled || saving}
                          onChange={setBaseUsd}
                        />
                      </div>
                      <div className="space-y-1.5">
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
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          {selected.length === 0 ? (
            <p className="text-xs text-amber-700 dark:text-amber-400 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2">
              Sin opciones activas, el carrito no mostrará modalidades de entrega.
            </p>
          ) : null}

          {dirty ? (
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
              <Button type="button" disabled={saving} onClick={() => void handleSave()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Guardar modalidades
              </Button>
              <Button type="button" variant="outline" disabled={saving} onClick={discardChanges}>
                Descartar
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={explainMode != null} onOpenChange={(open) => !open && setExplainMode(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {explainMode ? STORE_FULFILLMENT_LABELS[explainMode] : "Modalidad"}
            </DialogTitle>
            <DialogDescription>
              {explainMode ? STORE_FULFILLMENT_DESCRIPTIONS[explainMode] : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setExplainMode(null)}>
              Cerrar
            </Button>
            {explainMode && !isChecked(explainMode) ? (
              <Button type="button" onClick={confirmEnableMode}>
                Activar esta opción
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
