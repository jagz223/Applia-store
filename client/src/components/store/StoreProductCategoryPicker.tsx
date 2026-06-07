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
import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";

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
  const [browseOpen, setBrowseOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const selectedIds = useMemo(() => new Set(selected.map((s) => s.id)), [selected]);
  const trimmedSearch = search.trim();
  const searchKey = categoryKey(trimmedSearch);

  const alreadySelected = useMemo(
    () => trimmedSearch.length > 0 && selected.some((s) => categoryKey(s.name) === searchKey),
    [selected, searchKey, trimmedSearch],
  );

  const canAdd = trimmedSearch.length > 0 && !alreadySelected;

  const filteredBrowse = useMemo(() => {
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
  }

  function removeId(id: number) {
    onChange(selected.filter((s) => s.id !== id));
  }

  async function handleAddOrCreate() {
    if (!canAdd || creating || disabled) return;

    const existing = categories.find((c) => categoryKey(c.name) === searchKey);
    if (existing) {
      addItem({ id: existing.id, name: existing.name });
      toast({ title: "Añadida", description: `«${existing.name}» seleccionada.` });
      return;
    }

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

  return (
    <div className="space-y-2">
      <Label>Categorías del producto</Label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Escribe para buscar o crear…"
            className="pl-9"
            disabled={disabled || isLoading}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleAddOrCreate();
              }
            }}
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="shrink-0"
          disabled={!canAdd || creating || disabled || isLoading}
          title={
            canAdd
              ? categories.some((c) => categoryKey(c.name) === searchKey)
                ? `Añadir «${trimmedSearch}»`
                : `Crear categoría «${trimmedSearch}»`
              : alreadySelected
                ? "Ya está en la selección"
                : "Escribe un nombre"
          }
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => void handleAddOrCreate()}
        >
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        </Button>
        <Popover open={browseOpen} onOpenChange={setBrowseOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="shrink-0 px-3"
              disabled={disabled || isLoading}
            >
              Lista
            </Button>
          </PopoverTrigger>
          <PopoverContent
            layer="modal"
            className="w-[min(360px,calc(100vw-2rem))] p-0"
            align="end"
          >
            <Command shouldFilter={false}>
              <CommandList className="max-h-56">
                {isLoading ? (
                  <div className="py-6 flex justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <>
                    <CommandEmpty>
                      {trimmedSearch
                        ? "Sin coincidencias. Usa + para crear la categoría."
                        : "Escribe arriba o elige de la lista"}
                    </CommandEmpty>
                    <CommandGroup>
                      {filteredBrowse.map((item) => (
                        <CommandItem
                          key={item.id}
                          value={String(item.id)}
                          onSelect={() => {
                            addItem({ id: item.id, name: item.name });
                            setBrowseOpen(false);
                          }}
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
      </div>

      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {selected.map((item) => (
            <Badge key={item.id} variant="secondary" className="gap-1 pr-1">
              {item.name}
              <button
                type="button"
                className="ml-0.5 rounded-sm p-0.5 hover:bg-muted disabled:opacity-50"
                aria-label={`Quitar ${item.name}`}
                disabled={disabled}
                onClick={() => removeId(item.id)}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Escribe un nombre y pulsa + para crear o seleccionar una categoría (ej. Laptop).
        </p>
      )}
    </div>
  );
}
