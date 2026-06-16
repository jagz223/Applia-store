import { useEffect, useState } from "react";
import { Info, Loader2 } from "lucide-react";
import {
  STORE_FULFILLMENT_DESCRIPTIONS,
  STORE_FULFILLMENT_LABELS,
  STORE_FULFILLMENT_MODES,
  type StoreFulfillmentMode,
} from "@shared/store-fulfillment";
import {
  STORE_FULFILLMENT_REQUIRES_LOCATION_MESSAGE,
  type StoreLocation,
} from "@shared/store-schema";
import { useUpdateStore } from "@/hooks/use-store-settings";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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
  storeLocation: StoreLocation | null;
  disabled?: boolean;
};

export function StoreFulfillmentConfigCard({
  slug,
  initialOptions,
  storeLocation,
  disabled,
}: StoreFulfillmentConfigCardProps) {
  const { toast } = useToast();
  const updateStore = useUpdateStore(slug);

  const [savedOptions, setSavedOptions] = useState<StoreFulfillmentMode[]>(initialOptions);
  const [selected, setSelected] = useState<StoreFulfillmentMode[]>(initialOptions);
  const [explainMode, setExplainMode] = useState<StoreFulfillmentMode | null>(null);

  const hasStoreLocation = storeLocation != null;

  useEffect(() => {
    setSavedOptions(initialOptions);
    setSelected(initialOptions);
  }, [initialOptions]);

  const dirty =
    selected.length !== savedOptions.length ||
    STORE_FULFILLMENT_MODES.some((mode) => selected.includes(mode) !== savedOptions.includes(mode));

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
  }

  async function handleSave() {
    if (selected.length > 0 && !hasStoreLocation) {
      warnLocationRequired();
      return;
    }
    try {
      const store = await updateStore.mutateAsync({ fulfillmentOptions: selected });
      const next = store.fulfillmentOptions ?? selected;
      setSavedOptions(next);
      setSelected(next);
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
              <div
                key={mode}
                className="flex items-start gap-3 rounded-lg border border-border px-3 py-3"
              >
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
