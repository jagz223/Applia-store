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
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

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
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);

  // Buscar mientras el desplegable está abierto (al escribir o al abrir Lista).
  const { data, isLoading, isFetching } = useIngredientsMaterials(search, page, open);

  const selectedIds = useMemo(() => new Set(selected.map((s) => s.id)), [selected]);
  const searchKey = ingredientMaterialKey(search);
  const trimmedSearch = search.trim();

  const alreadySelected = useMemo(
    () => trimmedSearch.length > 0 && selected.some((s) => ingredientMaterialKey(s.name) === searchKey),
    [selected, searchKey, trimmedSearch],
  );

  const exactMatch = useMemo(
    () =>
      trimmedSearch.length > 0
        ? (data?.items ?? []).find((item) => itemMatchesKey(item, searchKey))
        : undefined,
    [data?.items, searchKey, trimmedSearch],
  );

  /** Solo desbloquea + cuando no hay coincidencia exacta en resultados. */
  const canCreate =
    trimmedSearch.length > 0 && !alreadySelected && !exactMatch && !isLoading && !isFetching;

  const totalPages = data ? Math.max(1, Math.ceil(data.total / INGREDIENTS_MATERIALS_PAGE_SIZE)) : 1;
  const items = data?.items ?? [];

  function addItem(item: IngredientMaterialItem) {
    if (selectedIds.has(item.id)) return;
    onChange([...selected, { id: item.id, name: item.name }]);
    setSearch("");
    setPage(1);
    setOpen(false);
  }

  async function handleCreate() {
    if (!canCreate || creating) return;
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

  async function handleEnter() {
    if (creating) return;
    if (exactMatch && !selectedIds.has(exactMatch.id)) {
      addItem(exactMatch);
      return;
    }
    if (canCreate) await handleCreate();
  }

  function removeId(id: number) {
    onChange(selected.filter((s) => s.id !== id));
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverAnchor asChild>
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                  setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                placeholder="Buscar ingrediente…"
                className="pl-9"
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
            className="w-[min(22rem,calc(100vw-3rem))] border-border bg-popover p-0 text-popover-foreground shadow-lg"
            align="start"
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <Command shouldFilter={false}>
              <CommandList className="max-h-[240px] overflow-y-auto">
                {isLoading ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <>
                    <CommandEmpty>
                      {trimmedSearch
                        ? canCreate
                          ? "Sin coincidencias. Usa + para crear este ingrediente."
                          : alreadySelected
                            ? "Ya está seleccionado."
                            : "Sin coincidencias en esta página."
                        : "Escribe para filtrar o navega la lista."}
                    </CommandEmpty>
                    <CommandGroup>
                      {items.map((item) => {
                        const picked = selectedIds.has(item.id);
                        return (
                          <CommandItem
                            key={item.id}
                            value={String(item.id)}
                            disabled={picked}
                            onSelect={() => {
                              if (!picked) addItem(item);
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

        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="shrink-0"
          disabled={!canCreate || creating || isFetching}
          title={
            canCreate
              ? `Crear «${trimmedSearch}»`
              : exactMatch
                ? "Ya existe: elígelo en la lista"
                : alreadySelected
                  ? "Ya está en la selección"
                  : isFetching
                    ? "Buscando…"
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
                  "hover:bg-destructive/15 hover:text-destructive",
                )}
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
          Escribe para buscar y elige de la lista. El + solo crea uno nuevo si no existe.
        </p>
      )}
    </div>
  );
}
