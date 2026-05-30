import { useMemo } from "react";
import { StoreEntityMultiPicker, type SelectedEntity } from "@/components/store/StoreEntityMultiPicker";
import { useStoreProducts } from "@/hooks/use-store-products";

export function StoreCategoryProductPicker({
  storeId,
  selected,
  onChange,
  disabled,
}: {
  storeId: number;
  selected: SelectedEntity[];
  onChange: (next: SelectedEntity[]) => void;
  disabled?: boolean;
}) {
  const { data: products = [], isLoading } = useStoreProducts(storeId);

  const options = useMemo(
    () => products.map((p) => ({ id: p.id, name: p.name })),
    [products],
  );

  return (
    <StoreEntityMultiPicker
      label="Productos de la categoría"
      placeholder="Buscar y añadir productos…"
      emptyHint="No hay más productos disponibles"
      selected={selected}
      onChange={onChange}
      options={options}
      isLoading={isLoading}
      disabled={disabled}
    />
  );
}
