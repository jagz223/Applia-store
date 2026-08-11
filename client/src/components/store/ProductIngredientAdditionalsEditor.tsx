import { Button } from "@/components/ui/button";
import { NumberField } from "@/components/ui/number-field";
import { Label } from "@/components/ui/label";
import { StoreSelectableChip } from "@/components/store/StoreSelectableChip";
import type { SelectedIngredient } from "@/components/store/IngredientMaterialPicker";
import { currencyLabelForId, type StoreCurrencyExtra } from "@shared/store-currency-schema";

export type ProductIngredientAdditionalDraft = {
  ingredientMaterialId: number;
  /** currencyId → precio (sin tamaños). */
  pricesByCurrency: Record<string, string>;
  /** sizeId → currencyId → precio. */
  pricesBySize: Record<string, Record<string, string>>;
};

export type ProductSizeDraftRef = {
  id: string;
  name: string;
};

function emptyCurrencyPrices(ids: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const id of ids) out[id] = "";
  return out;
}

export function emptyAdditionalDraft(
  ingredientMaterialId: number,
  acceptedPaymentIds: string[],
  sizeIds: string[] = [],
): ProductIngredientAdditionalDraft {
  if (sizeIds.length > 0) {
    const pricesBySize: Record<string, Record<string, string>> = {};
    for (const sizeId of sizeIds) {
      pricesBySize[sizeId] = emptyCurrencyPrices(acceptedPaymentIds);
    }
    return { ingredientMaterialId, pricesByCurrency: {}, pricesBySize };
  }
  return {
    ingredientMaterialId,
    pricesByCurrency: emptyCurrencyPrices(acceptedPaymentIds),
    pricesBySize: {},
  };
}

/**
 * Adicionales con precio: solo de la lista base, excluyendo los marcados «a sacar».
 * Sin tamaños → precio por moneda; con tamaños → precio por tamaño × moneda.
 */
export function ProductIngredientAdditionalsEditor({
  options,
  value,
  onChange,
  disabled,
  acceptedPaymentIds,
  currencyExtras = [],
  sizes = [],
}: {
  options: SelectedIngredient[];
  value: ProductIngredientAdditionalDraft[];
  onChange: (next: ProductIngredientAdditionalDraft[]) => void;
  disabled?: boolean;
  acceptedPaymentIds: string[];
  currencyExtras?: StoreCurrencyExtra[];
  sizes?: ProductSizeDraftRef[];
}) {
  const selectedMap = new Map(value.map((v) => [v.ingredientMaterialId, v]));
  const sizeIds = sizes.map((s) => s.id);
  const hasSizes = sizes.length > 0;

  function toggle(item: SelectedIngredient) {
    if (disabled) return;
    if (selectedMap.has(item.id)) {
      onChange(value.filter((v) => v.ingredientMaterialId !== item.id));
      return;
    }
    onChange([...value, emptyAdditionalDraft(item.id, acceptedPaymentIds, sizeIds)]);
  }

  function setCurrencyPrice(ingredientId: number, currencyId: string, price: string) {
    onChange(
      value.map((v) => {
        if (v.ingredientMaterialId !== ingredientId) return v;
        return {
          ...v,
          pricesByCurrency: { ...v.pricesByCurrency, [currencyId]: price },
        };
      }),
    );
  }

  function setSizeCurrencyPrice(
    ingredientId: number,
    sizeId: string,
    currencyId: string,
    price: string,
  ) {
    onChange(
      value.map((v) => {
        if (v.ingredientMaterialId !== ingredientId) return v;
        const prevSize = v.pricesBySize[sizeId] ?? emptyCurrencyPrices(acceptedPaymentIds);
        return {
          ...v,
          pricesBySize: {
            ...v.pricesBySize,
            [sizeId]: { ...prevSize, [currencyId]: price },
          },
        };
      }),
    );
  }

  if (options.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay materiales disponibles para adicionales (todos están marcados como «a sacar» o aún no hay
        ingredientes).
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        {hasSizes
          ? "Elige adicionales e indica el precio por cada tamaño y moneda."
          : "Elige adicionales e indica el precio por cada moneda aceptada."}
      </p>
      <div className="flex flex-wrap gap-2">
        {options.map((item) => (
          <StoreSelectableChip
            key={item.id}
            active={selectedMap.has(item.id)}
            disabled={disabled}
            onClick={() => toggle(item)}
          >
            {item.name}
          </StoreSelectableChip>
        ))}
      </div>

      {value.length > 0 ? (
        <div className="space-y-4">
          {value.map((row) => {
            const name =
              options.find((o) => o.id === row.ingredientMaterialId)?.name ??
              `Item #${row.ingredientMaterialId}`;
            return (
              <div
                key={row.ingredientMaterialId}
                className="space-y-3 rounded-xl border border-border/80 bg-muted/20 p-3.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{name}</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 rounded-full border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={disabled}
                    onClick={() =>
                      onChange(value.filter((v) => v.ingredientMaterialId !== row.ingredientMaterialId))
                    }
                  >
                    Quitar
                  </Button>
                </div>

                {hasSizes ? (
                  sizes.map((size) => (
                    <div
                      key={size.id}
                      className="space-y-2 rounded-lg border border-border/60 bg-background/60 p-3"
                    >
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {size.name || "Tamaño"}
                      </p>
                      {acceptedPaymentIds.map((currencyId) => {
                        const label = currencyLabelForId(currencyId, currencyExtras);
                        return (
                          <div key={currencyId} className="space-y-1.5">
                            <Label
                              htmlFor={`additional-${row.ingredientMaterialId}-${size.id}-${currencyId}`}
                              className="text-xs"
                            >
                              Precio ({label})
                            </Label>
                            <NumberField
                              id={`additional-${row.ingredientMaterialId}-${size.id}-${currencyId}`}
                              min="0.01"
                              step="0.01"
                              value={row.pricesBySize[size.id]?.[currencyId] ?? ""}
                              disabled={disabled}
                              onChange={(next) =>
                                setSizeCurrencyPrice(
                                  row.ingredientMaterialId,
                                  size.id,
                                  currencyId,
                                  next,
                                )
                              }
                              required
                            />
                          </div>
                        );
                      })}
                    </div>
                  ))
                ) : (
                  acceptedPaymentIds.map((currencyId) => {
                    const label = currencyLabelForId(currencyId, currencyExtras);
                    return (
                      <div key={currencyId} className="space-y-1.5">
                        <Label
                          htmlFor={`additional-${row.ingredientMaterialId}-${currencyId}`}
                          className="text-xs"
                        >
                          Precio ({label})
                        </Label>
                        <NumberField
                          id={`additional-${row.ingredientMaterialId}-${currencyId}`}
                          min="0.01"
                          step="0.01"
                          value={row.pricesByCurrency[currencyId] ?? ""}
                          disabled={disabled}
                          onChange={(next) =>
                            setCurrencyPrice(row.ingredientMaterialId, currencyId, next)
                          }
                          required
                        />
                      </div>
                    );
                  })
                )}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
