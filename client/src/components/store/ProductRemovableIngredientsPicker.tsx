import { StoreSelectableChip } from "@/components/store/StoreSelectableChip";
import type { SelectedIngredient } from "@/components/store/IngredientMaterialPicker";

/**
 * Selección de ingredientes/materiales que el cliente podrá quitar del producto.
 * Solo ofrece los ya añadidos al producto.
 */
export function ProductRemovableIngredientsPicker({
  options,
  selectedIds,
  onChange,
  disabled,
}: {
  options: SelectedIngredient[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  disabled?: boolean;
}) {
  const selected = new Set(selectedIds);

  function toggle(id: number) {
    if (disabled) return;
    if (selected.has(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }

  if (options.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Añade al menos 2 ingredientes o materiales arriba para elegir cuáles se pueden sacar.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Pulsa para marcar los que el cliente podrá quitar. Seleccionados: {selectedIds.length}.
      </p>
      <div className="flex flex-wrap gap-2">
        {options.map((item) => (
          <StoreSelectableChip
            key={item.id}
            active={selected.has(item.id)}
            disabled={disabled}
            onClick={() => toggle(item.id)}
          >
            {item.name}
          </StoreSelectableChip>
        ))}
      </div>
    </div>
  );
}
