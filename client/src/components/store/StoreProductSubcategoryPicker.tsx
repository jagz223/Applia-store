import { useMemo, useState } from "react";
import { ChevronDown, Loader2, Plus, X } from "lucide-react";
import {
  useCreateStoreSubcategory,
  useStoreSubcategories,
} from "@/hooks/use-store-subcategories";
import type { SelectedEntity } from "@/components/store/StoreEntityMultiPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export type SelectedSubcategory = SelectedEntity & { categoryId: number };

function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

export function StoreProductSubcategoryPicker({
  storeId,
  selectedCategories,
  selected,
  onChange,
  disabled,
}: {
  storeId: number;
  selectedCategories: SelectedEntity[];
  selected: SelectedSubcategory[];
  onChange: (next: SelectedSubcategory[]) => void;
  disabled?: boolean;
}) {
  const { toast } = useToast();
  const categoryIds = useMemo(
    () => selectedCategories.map((c) => c.id),
    [selectedCategories],
  );
  const categoryNameById = useMemo(
    () => new Map(selectedCategories.map((c) => [c.id, c.name])),
    [selectedCategories],
  );

  const { data: allSubs = [], isLoading } = useStoreSubcategories(
    storeId,
    selectedCategories.length > 0,
  );
  const createMutation = useCreateStoreSubcategory(storeId);

  const available = useMemo(
    () => allSubs.filter((s) => categoryIds.includes(s.categoryId)),
    [allSubs, categoryIds],
  );

  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [creating, setCreating] = useState(false);

  const selectedIds = useMemo(() => new Set(selected.map((s) => s.id)), [selected]);
  const trimmedFilter = filter.trim();
  const filterKey = nameKey(trimmedFilter);

  const exactMatch = useMemo(
    () =>
      trimmedFilter.length > 0
        ? available.find((s) => nameKey(s.name) === filterKey)
        : undefined,
    [available, filterKey, trimmedFilter],
  );

  const alreadySelected = useMemo(
    () => trimmedFilter.length > 0 && selected.some((s) => nameKey(s.name) === filterKey),
    [selected, filterKey, trimmedFilter],
  );

  const canCreate =
    trimmedFilter.length > 0 &&
    !alreadySelected &&
    !exactMatch &&
    selectedCategories.length > 0;

  const filtered = useMemo(() => {
    const q = trimmedFilter.toLowerCase();
    return available.filter((s) => {
      if (selectedIds.has(s.id)) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        (s.categoryName ?? "").toLowerCase().includes(q) ||
        (categoryNameById.get(s.categoryId) ?? "").toLowerCase().includes(q)
      );
    });
  }, [available, trimmedFilter, selectedIds, categoryNameById]);

  const grouped = useMemo(() => {
    const byCategory = new Map<number, typeof filtered>();
    for (const s of filtered) {
      const list = byCategory.get(s.categoryId) ?? [];
      list.push(s);
      byCategory.set(s.categoryId, list);
    }
    return selectedCategories
      .map((c) => ({ category: c, items: byCategory.get(c.id) ?? [] }))
      .filter((g) => g.items.length > 0);
  }, [filtered, selectedCategories]);

  function addItem(item: SelectedSubcategory) {
    if (selectedIds.has(item.id)) return;
    onChange([...selected, item]);
    setFilter("");
    setOpen(false);
  }

  function removeId(id: number) {
    onChange(selected.filter((s) => s.id !== id));
  }

  async function handleCreate(categoryId: number) {
    if (!canCreate || creating || disabled) return;
    setCreating(true);
    try {
      const created = await createMutation.mutateAsync({
        name: trimmedFilter,
        categoryId,
        description: null,
      });
      addItem({ id: created.id, name: created.name, categoryId: created.categoryId });
      toast({
        title: "Subcategoría creada",
        description: `«${created.name}» añadida. Recuerda guardar el producto.`,
      });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "No se pudo crear la subcategoría",
        description: e instanceof Error ? e.message : "Error desconocido",
      });
    } finally {
      setCreating(false);
    }
  }

  if (selectedCategories.length === 0) {
    return (
      <div className="space-y-2">
        <Label>Subcategorías del producto</Label>
        <p className="text-xs text-muted-foreground">
          Primero elige al menos una categoría para asignar subcategorías (opcional).
        </p>
      </div>
    );
  }

  const remainingCount = available.filter((s) => !selectedIds.has(s.id)).length;

  return (
    <div className="space-y-2">
      <Label>Subcategorías del producto</Label>
      <p className="text-xs text-muted-foreground">
        Opcional. Abre el menú y elige; solo aparecen las de las categorías seleccionadas.
      </p>

      <Popover
        open={open && !disabled}
        onOpenChange={(next) => {
          if (disabled) return;
          setOpen(next);
          if (!next) setFilter("");
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="h-10 w-full justify-between rounded-md font-normal"
            disabled={disabled || isLoading}
            aria-expanded={open}
          >
            <span className="truncate text-left">
              {isLoading
                ? "Cargando subcategorías…"
                : remainingCount === 0
                  ? "No hay más subcategorías"
                  : "Elegir subcategoría"}
            </span>
            {isLoading ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin opacity-70" />
            ) : (
              <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          layer="modal"
          align="start"
          className="w-[var(--radix-popover-trigger-width)] min-w-[16rem] p-0"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="border-b border-border p-2">
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filtrar lista…"
              className="h-9"
              disabled={disabled || creating}
              autoComplete="off"
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 && !canCreate ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                {trimmedFilter
                  ? alreadySelected
                    ? "Esa subcategoría ya está seleccionada."
                    : "Sin coincidencias en la lista."
                  : remainingCount === 0
                    ? "Ya elegiste todas las subcategorías disponibles."
                    : "No hay subcategorías en estas categorías."}
              </p>
            ) : (
              grouped.map(({ category, items }) => (
                <div key={category.id} className="px-1 py-1">
                  {selectedCategories.length > 1 ? (
                    <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {category.name}
                    </p>
                  ) : null}
                  {items.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className={cn(
                        "flex w-full items-center rounded-sm px-2 py-2 text-left text-sm",
                        "hover:bg-accent hover:text-accent-foreground",
                      )}
                      onClick={() =>
                        addItem({ id: s.id, name: s.name, categoryId: s.categoryId })
                      }
                    >
                      <span className="truncate">{s.name}</span>
                    </button>
                  ))}
                </div>
              ))
            )}
            {canCreate && selectedCategories.length === 1 ? (
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                disabled={creating}
                onClick={() => void handleCreate(selectedCategories[0].id)}
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Crear «{trimmedFilter}» en {selectedCategories[0].name}
              </button>
            ) : null}
            {canCreate && selectedCategories.length > 1 ? (
              <div className="border-t border-border px-1 py-1">
                <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Crear en categoría
                </p>
                {selectedCategories.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent"
                    disabled={creating}
                    onClick={() => void handleCreate(c.id)}
                  >
                    {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    «{trimmedFilter}» → {c.name}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </PopoverContent>
      </Popover>

      {selected.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {selected.map((s) => (
            <li
              key={s.id}
              className={cn(
                "inline-flex max-w-full items-center gap-1.5 rounded-full border border-border/70",
                "bg-muted/30 px-2.5 py-1 text-sm",
              )}
            >
              <span className="truncate">
                {s.name}
                <span className="text-muted-foreground">
                  {" "}
                  · {categoryNameById.get(s.categoryId) ?? `Cat. #${s.categoryId}`}
                </span>
              </span>
              <button
                type="button"
                className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
                aria-label={`Quitar ${s.name}`}
                disabled={disabled}
                onClick={() => removeId(s.id)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
