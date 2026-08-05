import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import {
  STORE_CURRENCY_EUR_ID,
  STORE_CURRENCY_USD_ID,
  newStoreCurrencyExtraId,
  type StoreCurrencyExtra,
} from "@shared/store-currency-schema";
import { useBcvRates, useUpdateStoreCurrencySettings } from "@/hooks/use-store-currency";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

type ExtraDraft = { id: string; name: string; value: string };

function newExtra(): ExtraDraft {
  return {
    id: newStoreCurrencyExtraId(),
    name: "",
    value: "",
  };
}

function formatBs(rate: number): string {
  return new Intl.NumberFormat("es-VE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(rate);
}

type CurrencySettingsSnapshot = {
  extras: StoreCurrencyExtra[];
  visualCurrencyId: string;
  acceptedPaymentIds: string[];
};

type StoreAdminCurrencyPanelProps = {
  storeId: number;
  slug: string;
  initialExtras: StoreCurrencyExtra[];
  initialVisualCurrencyId?: string;
  initialAcceptedPaymentIds?: string[];
};

export function StoreAdminCurrencyPanel({
  storeId,
  slug,
  initialExtras,
  initialVisualCurrencyId = STORE_CURRENCY_USD_ID,
  initialAcceptedPaymentIds = [STORE_CURRENCY_USD_ID],
}: StoreAdminCurrencyPanelProps) {
  const { toast } = useToast();
  const bcvQuery = useBcvRates();
  const saveMutation = useUpdateStoreCurrencySettings(storeId, slug);

  const initialSnapshot: CurrencySettingsSnapshot = useMemo(
    () => ({
      extras: initialExtras,
      visualCurrencyId: initialVisualCurrencyId || STORE_CURRENCY_USD_ID,
      acceptedPaymentIds:
        initialAcceptedPaymentIds.length > 0
          ? initialAcceptedPaymentIds
          : [STORE_CURRENCY_USD_ID],
    }),
    [initialExtras, initialVisualCurrencyId, initialAcceptedPaymentIds],
  );

  const [extras, setExtras] = useState<ExtraDraft[]>(() =>
    initialSnapshot.extras.map((f) => ({ id: f.id, name: f.name, value: f.value })),
  );
  const [visualCurrencyId, setVisualCurrencyId] = useState(initialSnapshot.visualCurrencyId);
  const [acceptedPaymentIds, setAcceptedPaymentIds] = useState<string[]>(
    initialSnapshot.acceptedPaymentIds,
  );
  const [savedFingerprint, setSavedFingerprint] = useState(() => JSON.stringify(initialSnapshot));

  const initialFingerprint = JSON.stringify(initialSnapshot);

  useEffect(() => {
    const parsed = JSON.parse(initialFingerprint) as CurrencySettingsSnapshot;
    setExtras(parsed.extras.map((f) => ({ id: f.id, name: f.name, value: f.value })));
    setVisualCurrencyId(parsed.visualCurrencyId);
    setAcceptedPaymentIds(parsed.acceptedPaymentIds);
    setSavedFingerprint(initialFingerprint);
  }, [initialFingerprint]);

  const currentExtras: StoreCurrencyExtra[] = extras
    .map((f) => ({ id: f.id, name: f.name.trim(), value: f.value.trim() }))
    .filter((f) => f.name && f.value);

  const currentPayload: CurrencySettingsSnapshot = {
    extras: currentExtras,
    visualCurrencyId,
    acceptedPaymentIds,
  };
  const dirty = JSON.stringify(currentPayload) !== savedFingerprint;
  const saving = saveMutation.isPending;

  const dollar = bcvQuery.data?.dollar;
  const euro = bcvQuery.data?.euro;

  const builtinRows = [
    {
      id: STORE_CURRENCY_USD_ID,
      label: "REF",
      rateLabel: dollar ? `${formatBs(dollar.rateBs)} Bs` : "Cargando…",
    },
    {
      id: STORE_CURRENCY_EUR_ID,
      label: "Euro",
      rateLabel: euro ? `${formatBs(euro.rateBs)} Bs` : "Cargando…",
    },
  ];

  function toggleAccepted(id: string, checked: boolean) {
    setAcceptedPaymentIds((prev) => {
      if (checked) {
        return prev.includes(id) ? prev : [...prev, id];
      }
      if (prev.length <= 1) {
        toast({
          variant: "destructive",
          title: "Se requiere al menos una moneda de pago",
        });
        return prev;
      }
      const next = prev.filter((x) => x !== id);
      if (visualCurrencyId === id) {
        setVisualCurrencyId(next.includes(STORE_CURRENCY_USD_ID) ? STORE_CURRENCY_USD_ID : next[0]);
      }
      return next;
    });
  }

  function setVisual(id: string) {
    setVisualCurrencyId(id);
    setAcceptedPaymentIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }

  async function handleSave() {
    for (const field of extras) {
      const name = field.name.trim();
      const value = field.value.trim();
      if ((name && !value) || (!name && value)) {
        toast({
          variant: "destructive",
          title: "Datos incompletos",
          description: "Cada tasa extra debe tener nombre y valor en Bs.",
        });
        return;
      }
    }
    if (acceptedPaymentIds.length === 0) {
      toast({
        variant: "destructive",
        title: "Selecciona al menos una moneda en «Se acepta como pago»",
      });
      return;
    }
    if (!acceptedPaymentIds.includes(visualCurrencyId)) {
      toast({
        variant: "destructive",
        title: "La moneda visual debe estar aceptada como pago",
      });
      return;
    }
    try {
      const saved = await saveMutation.mutateAsync({
        currencyExtras: currentExtras,
        currencyVisualId: visualCurrencyId,
        currencyAcceptedPaymentIds: acceptedPaymentIds,
      });
      const nextSnapshot: CurrencySettingsSnapshot = {
        extras: saved.currencyExtras,
        visualCurrencyId: saved.currencyVisualId,
        acceptedPaymentIds: saved.currencyAcceptedPaymentIds,
      };
      setSavedFingerprint(JSON.stringify(nextSnapshot));
      setExtras(nextSnapshot.extras.map((f) => ({ id: f.id, name: f.name, value: f.value })));
      setVisualCurrencyId(nextSnapshot.visualCurrencyId);
      setAcceptedPaymentIds(nextSnapshot.acceptedPaymentIds);
      toast({ title: "Configuración de moneda guardada" });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "No se pudo guardar",
        description: e instanceof Error ? e.message : "Error desconocido",
      });
    }
  }

  function discard() {
    const parsed = JSON.parse(savedFingerprint) as CurrencySettingsSnapshot;
    setExtras(parsed.extras.map((f) => ({ id: f.id, name: f.name, value: f.value })));
    setVisualCurrencyId(parsed.visualCurrencyId);
    setAcceptedPaymentIds(parsed.acceptedPaymentIds);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div className="space-y-1.5">
            <CardTitle>Moneda</CardTitle>
            <CardDescription>
              Tasas BCV en bolívares (Bs). Marca una sola moneda para la vitrina y todas las que
              aceptas como pago (definen los precios del producto).
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 shrink-0"
            disabled={bcvQuery.isFetching}
            onClick={() => void bcvQuery.refetch()}
          >
            {bcvQuery.isFetching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Actualizar BCV
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {bcvQuery.isError ? (
            <p className="text-sm text-destructive">
              {bcvQuery.error instanceof Error
                ? bcvQuery.error.message
                : "No se pudieron cargar las tasas BCV."}
            </p>
          ) : null}

          <RadioGroup value={visualCurrencyId} onValueChange={setVisual}>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[40rem] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left">
                    <th className="px-3 py-2.5 font-medium">Moneda</th>
                    <th className="px-3 py-2.5 font-medium">Tasa (Bs)</th>
                    <th className="px-3 py-2.5 font-medium text-center w-[8.5rem]">Visual en tienda</th>
                    <th className="px-3 py-2.5 font-medium text-center w-[9.5rem]">Se acepta como pago</th>
                    <th className="px-2 py-2.5 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {builtinRows.map((row) => (
                    <tr key={row.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-3 align-middle">
                        <span className="font-medium">{row.label}</span>
                      </td>
                      <td className="px-3 py-3 align-middle">
                        <span className="tabular-nums text-muted-foreground">
                          {bcvQuery.isLoading ? "…" : row.rateLabel}
                        </span>
                      </td>
                      <td className="px-3 py-3 align-middle text-center">
                        <div className="flex justify-center">
                          <RadioGroupItem value={row.id} id={`visual-${row.id}`} disabled={saving} />
                          <Label htmlFor={`visual-${row.id}`} className="sr-only">
                            Visual {row.label}
                          </Label>
                        </div>
                      </td>
                      <td className="px-3 py-3 align-middle text-center">
                        <div className="flex justify-center">
                          <Checkbox
                            checked={acceptedPaymentIds.includes(row.id)}
                            disabled={saving}
                            onCheckedChange={(v) => toggleAccepted(row.id, v === true)}
                            aria-label={`Aceptar ${row.label} como pago`}
                          />
                        </div>
                      </td>
                      <td className="px-2 py-3 align-middle" />
                    </tr>
                  ))}
                  {extras.map((field, index) => (
                    <tr key={field.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-3 align-middle">
                        <Input
                          value={field.name}
                          maxLength={80}
                          disabled={saving}
                          placeholder="Ej. Binance"
                          onChange={(e) =>
                            setExtras((prev) =>
                              prev.map((f) =>
                                f.id === field.id ? { ...f, name: e.target.value } : f,
                              ),
                            )
                          }
                        />
                      </td>
                      <td className="px-3 py-3 align-middle">
                        <Input
                          value={field.value}
                          maxLength={40}
                          disabled={saving}
                          placeholder="Ej. 450"
                          onChange={(e) =>
                            setExtras((prev) =>
                              prev.map((f) =>
                                f.id === field.id ? { ...f, value: e.target.value } : f,
                              ),
                            )
                          }
                        />
                      </td>
                      <td className="px-3 py-3 align-middle text-center">
                        <div className="flex justify-center">
                          <RadioGroupItem
                            value={field.id}
                            id={`visual-${field.id}`}
                            disabled={saving}
                          />
                          <Label htmlFor={`visual-${field.id}`} className="sr-only">
                            Visual {field.name.trim() || `Extra ${index + 1}`}
                          </Label>
                        </div>
                      </td>
                      <td className="px-3 py-3 align-middle text-center">
                        <div className="flex justify-center">
                          <Checkbox
                            checked={acceptedPaymentIds.includes(field.id)}
                            disabled={saving}
                            onCheckedChange={(v) => toggleAccepted(field.id, v === true)}
                            aria-label={`Aceptar ${field.name || `extra ${index + 1}`} como pago`}
                          />
                        </div>
                      </td>
                      <td className="px-2 py-3 align-middle">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 rounded-full border-destructive/35 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          disabled={saving}
                          aria-label="Quitar tasa extra"
                          onClick={() => {
                            setExtras((prev) => prev.filter((f) => f.id !== field.id));
                            setAcceptedPaymentIds((prev) => {
                              const next = prev.filter((x) => x !== field.id);
                              if (next.length === 0) return [STORE_CURRENCY_USD_ID];
                              return next;
                            });
                            if (visualCurrencyId === field.id) {
                              setVisualCurrencyId(STORE_CURRENCY_USD_ID);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </RadioGroup>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={saving || extras.length >= 30}
              onClick={() => setExtras((prev) => [...prev, newExtra()])}
            >
              <Plus className="h-3.5 w-3.5" />
              Agregar dato extra
            </Button>
          </div>

          {dirty ? (
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
              <Button type="button" disabled={saving} onClick={() => void handleSave()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Guardar moneda
              </Button>
              <Button type="button" variant="outline" disabled={saving} onClick={discard}>
                Descartar
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
