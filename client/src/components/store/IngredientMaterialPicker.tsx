import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Plus, Search, X } from "lucide-react";
import { ingredientMaterialKey } from "@shared/store-slug";
import { INGREDIENTS_MATERIALS_PAGE_SIZE } from "@shared/store-schema";
import {
  createOrSelectIngredientMaterial,
  useIngredientsMaterials,
  type IngredientMaterialItem,
} from "@/hooks/use-store-products";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export type SelectedIngredient = { id: number; name: string };

function itemMatchesKey(item: IngredientMaterialItem, key: string): boolean {
  if (!key) return false;
  return item.normalizedName === key || ingredientMaterialKey(item.name) === key;
}

export function IngredientMaterialPicker({
  selected,
  onChange,
}: {
  selected: SelectedIngredient[];
  onChange: (next: SelectedIngredient[]) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [browseOpen, setBrowseOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);

  const { data, isLoading, isFetching } = useIngredientsMaterials(search, page, browseOpen);

  const selectedIds = useMemo(() => new Set(selected.map((s) => s.id)), [selected]);
  const searchKey = ingredientMaterialKey(search);
  const trimmedSearch = search.trim();

  const alreadySelected = useMemo(
    () => trimmedSearch.length > 0 && selected.some((s) => ingredientMaterialKey(s.name) === searchKey),
    [selected, searchKey, trimmedSearch],
  );

  const canAdd = trimmedSearch.length > 0 && !alreadySelected;

  const totalPages = data ? Math.max(1, Math.ceil(data.total / INGREDIENTS_MATERIALS_PAGE_SIZE)) : 1;

  function addItem(item: IngredientMaterialItem) {
    if (selectedIds.has(item.id)) return;
    onChange([...selected, { id: item.id, name: item.name }]);
    setSearch("");
    setPage(1);
  }

  async function handleAddOrCreate() {
    if (!canAdd || creating) return;

    const localMatch = (data?.items ?? []).find((item) => itemMatchesKey(item, searchKey));
    if (localMatch) {
      addItem(localMatch);
      toast({ title: "Añadido", description: `«${localMatch.name}» seleccionado.` });
      return;
    }

    setCreating(true);
    try {
      const item = await createOrSelectIngredientMaterial(trimmedSearch);
      addItem(item);
      await qc.invalidateQueries({ queryKey: ["/api/ingredients-materials"] });
      toast({ title: "Añadido", description: `«${item.name}» listo en la selección.` });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "No se pudo añadir",
        description: e instanceof Error ? e.message : "Error desconocido",
      });
    } finally {
      setCreating(false);
    }
  }

  function removeId(id: number) {
    onChange(selected.filter((s) => s.id !== id));
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Escribe para buscar o crear…"
            className="pl-9"
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
          disabled={!canAdd || creating}
          title={
            canAdd
              ? `Añadir «${trimmedSearch}» (crea si no existe)`
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
            <Button type="button" variant="outline" className="shrink-0 px-3">
              Lista
            </Button>
          </PopoverTrigger>
          <PopoverContent
            layer="modal"
            className="w-[min(360px,calc(100vw-2rem))] border-border bg-popover p-0 text-popover-foreground shadow-lg"
            align="end"
          >
            <Command shouldFilter={false}>
              <CommandList className="max-h-[240px] overflow-y-auto">
                {isLoading ? (
                  <div className="py-6 flex justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <>
                    <CommandEmpty>
                      {trimmedSearch ? "Sin coincidencias en esta página" : "Escribe arriba o navega la lista"}
                    </CommandEmpty>
                    <CommandGroup>
                      {(data?.items ?? []).map((item) => {
                        const picked = selectedIds.has(item.id);
                        return (
                          <CommandItem
                            key={item.id}
                            value={String(item.id)}
                            disabled={picked}
                            onSelect={() => {
                              addItem(item);
                              setBrowseOpen(false);
                            }}
                          >
                            {item.name}
                            {picked ? " (ya seleccionado)" : ""}
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </>
                )}
              </CommandList>
              {totalPages > 1 ? (
                <div className="flex items-center justify-between border-t border-border px-2 py-1.5 text-xs text-muted-foreground">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2"
                    disabled={page <= 1 || isFetching}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span>
                    Pág. {page} / {totalPages}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2"
                    disabled={page >= totalPages || isFetching}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              ) : null}
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {selected.map((item) => (
            <span
              key={item.id}
              className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 pl-3 pr-1 py-1 text-xs font-semibold text-foreground"
            >
              {item.name}
              <button
                type="button"
                className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
                aria-label={`Quitar ${item.name}`}
                onClick={() => removeId(item.id)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Escribe un nombre y pulsa + para crear o seleccionar. También puedes elegir de la lista.
        </p>
      )}
    </div>
  );
}
