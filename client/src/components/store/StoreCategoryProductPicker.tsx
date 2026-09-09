import { useEffect, useState } from "react";
import { StoreEntityMultiPicker, type SelectedEntity } from "@/components/store/StoreEntityMultiPicker";
import { useStoreProductPickerSearch } from "@/hooks/use-store-products";

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
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(t);
  }, [search]);

  const { data: options = [], isFetching } = useStoreProductPickerSearch(storeId, debouncedSearch);

  return (
    <StoreEntityMultiPicker
      label="Productos de la categoría"
      placeholder="Buscar y añadir productos…"
      emptyHint="No hay más productos disponibles"
      selected={selected}
      onChange={onChange}
      options={options}
      isLoading={isFetching}
      disabled={disabled}
      searchMode="remote"
      onSearchChange={setSearch}
    />
  );
}
