import { Button } from "@/components/ui/button";
import { NumberField } from "@/components/ui/number-field";
import { Label } from "@/components/ui/label";
import { StoreSelectableChip } from "@/components/store/StoreSelectableChip";
import type { SelectedIngredient } from "@/components/store/IngredientMaterialPicker";

export type ProductIngredientAdditionalDraft = {
  ingredientMaterialId: number;
  price: string;
};

/**
 * Adicionales con precio: solo de la lista base, excluyendo los marcados «a sacar».
 */
export function ProductIngredientAdditionalsEditor({
  options,
  value,
  onChange,
  disabled,
  currencyLabel = "USD",
}: {
  options: SelectedIngredient[];
  value: ProductIngredientAdditionalDraft[];
  onChange: (next: ProductIngredientAdditionalDraft[]) => void;
  disabled?: boolean;
  currencyLabel?: string;
}) {
  const selectedMap = new Map(value.map((v) => [v.ingredientMaterialId, v]));

  function toggle(item: SelectedIngredient) {
    if (disabled) return;
    if (selectedMap.has(item.id)) {
      onChange(value.filter((v) => v.ingredientMaterialId !== item.id));
      return;
    }
    onChange([...value, { ingredientMaterialId: item.id, price: "" }]);
  }

  function setPrice(id: number, price: string) {
    onChange(value.map((v) => (v.ingredientMaterialId === id ? { ...v, price } : v)));
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
        Elige de los ingredientes del producto (excepto los de «a sacar») e indica el precio de cada
        adicional.
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
        <div className="space-y-3 rounded-xl border border-border/80 bg-muted/20 p-3.5">
          {value.map((row) => {
            const name =
              options.find((o) => o.id === row.ingredientMaterialId)?.name ??
              `Item #${row.ingredientMaterialId}`;
            return (
              <div
                key={row.ingredientMaterialId}
                className="flex flex-wrap items-end gap-2 sm:flex-nowrap"
              >
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Label htmlFor={`additional-price-${row.ingredientMaterialId}`} className="text-xs">
                    {name} ({currencyLabel})
                  </Label>
                  <NumberField
                    id={`additional-price-${row.ingredientMaterialId}`}
                    prefix="$"
                    min="0.01"
                    step="0.01"
                    value={row.price}
                    disabled={disabled}
                    onChange={(next) => setPrice(row.ingredientMaterialId, next)}
                    required
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mb-0.5 shrink-0 rounded-full border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={disabled}
                  onClick={() =>
                    onChange(value.filter((v) => v.ingredientMaterialId !== row.ingredientMaterialId))
                  }
                >
                  Quitar
                </Button>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
