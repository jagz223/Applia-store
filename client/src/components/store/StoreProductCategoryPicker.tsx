import { useMemo, useState } from "react";
import { Loader2, Plus, Search, X } from "lucide-react";
import {
  useCreateStoreCategory,
  useStoreCategories,
} from "@/hooks/use-store-categories";
import type { SelectedEntity } from "@/components/store/StoreEntityMultiPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

function categoryKey(name: string): string {
  return name.trim().toLowerCase();
}

export function StoreProductCategoryPicker({
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
  const { toast } = useToast();
  const { data: categories = [], isLoading } = useStoreCategories(storeId);
  const createMutation = useCreateStoreCategory(storeId);

  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const selectedIds = useMemo(() => new Set(selected.map((s) => s.id)), [selected]);
  const trimmedSearch = search.trim();
  const searchKey = categoryKey(trimmedSearch);

  const alreadySelected = useMemo(
    () => trimmedSearch.length > 0 && selected.some((s) => categoryKey(s.name) === searchKey),
    [selected, searchKey, trimmedSearch],
  );

  const exactMatch = useMemo(
    () => (trimmedSearch.length > 0 ? categories.find((c) => categoryKey(c.name) === searchKey) : undefined),
    [categories, searchKey, trimmedSearch],
  );

  /** Solo desbloquea + cuando el nombre no existe aún. */
  const canCreate = trimmedSearch.length > 0 && !alreadySelected && !exactMatch;

  const filtered = useMemo(() => {
    const q = trimmedSearch.toLowerCase();
    return categories.filter((c) => {
      if (selectedIds.has(c.id)) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q);
    });
  }, [categories, trimmedSearch, selectedIds]);

  function addItem(item: SelectedEntity) {
    if (selectedIds.has(item.id)) return;
    onChange([...selected, item]);
    setSearch("");
    setOpen(false);
  }

  function removeId(id: number) {
    onChange(selected.filter((s) => s.id !== id));
  }

  async function handleCreate() {
    if (!canCreate || creating || disabled) return;
    setCreating(true);
    try {
      const created = await createMutation.mutateAsync({
        name: trimmedSearch,
        description: null,
        productIds: [],
      });
      addItem({ id: created.id, name: created.name });
      toast({
        title: "Categoría creada",
        description: `«${created.name}» añadida. Recuerda guardar el producto.`,
      });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "No se pudo crear la categoría",
        description: e instanceof Error ? e.message : "Error desconocido",
      });
    } finally {
      setCreating(false);
    }
  }

  async function handleEnter() {
    if (disabled || creating) return;
    if (exactMatch && !selectedIds.has(exactMatch.id)) {
      addItem({ id: exactMatch.id, name: exactMatch.name });
      return;
    }
    if (canCreate) await handleCreate();
  }

  return (
    <div className="space-y-2">
      <Label>Categorías del producto</Label>
      <div className="flex gap-2">
        <Popover
          open={open && !disabled}
          onOpenChange={(next) => {
            if (!disabled) setOpen(next);
          }}
        >
          <PopoverAnchor asChild>
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                placeholder="Buscar categoría…"
                className="pl-9"
                disabled={disabled || isLoading}
                autoComplete="off"
                aria-autocomplete="list"
                aria-expanded={open}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleEnter();
                  }
                  if (e.key === "Escape") setOpen(false);
                }}
              />
            </div>
          </PopoverAnchor>
          <PopoverContent
            layer="modal"
            className="w-[min(22rem,calc(100vw-3rem))] p-0"
            align="start"
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <Command shouldFilter={false}>
              <CommandList className="max-h-56">
                {isLoading ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <>
                    <CommandEmpty>
                      {trimmedSearch
                        ? canCreate
                          ? "Sin coincidencias. Usa + para crear esta categoría."
                          : alreadySelected
                            ? "Ya está seleccionada."
                            : "Sin coincidencias."
                        : "Escribe para filtrar o elige de la lista."}
                    </CommandEmpty>
                    <CommandGroup>
                      {filtered.map((item) => (
                        <CommandItem
                          key={item.id}
                          value={String(item.id)}
                          onSelect={() => addItem({ id: item.id, name: item.name })}
                        >
                          {item.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="shrink-0"
          disabled={!canCreate || creating || disabled || isLoading}
          title={
            canCreate
              ? `Crear categoría «${trimmedSearch}»`
              : exactMatch
                ? "Ya existe: elígela en la lista"
                : alreadySelected
                  ? "Ya está en la selección"
                  : "Escribe un nombre nuevo para crear"
          }
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => void handleCreate()}
        >
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        </Button>

        <Button
          type="button"
          variant="outline"
          className="shrink-0 px-3"
          disabled={disabled || isLoading}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setOpen(true)}
        >
          Lista
        </Button>
      </div>

      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {selected.map((item) => (
            <span
              key={item.id}
              className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 py-1 pl-3 pr-1 text-xs font-semibold text-foreground"
            >
              {item.name}
              <button
                type="button"
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors",
                  "hover:bg-destructive/15 hover:text-destructive disabled:opacity-50",
                )}
                aria-label={`Quitar ${item.name}`}
                disabled={disabled}
                onClick={() => removeId(item.id)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Escribe para buscar y elige una categoría. El + solo crea una nueva si no existe.
        </p>
      )}
    </div>
  );
}
