import { useMemo, useState } from "react";
import { Loader2, Plus, Search, X } from "lucide-react";
import {
  useCreateStoreSubcategory,
  useStoreSubcategories,
} from "@/hooks/use-store-subcategories";
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

  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForCategoryId, setCreateForCategoryId] = useState<number | null>(null);

  const selectedIds = useMemo(() => new Set(selected.map((s) => s.id)), [selected]);
  const trimmedSearch = search.trim();
  const searchKey = nameKey(trimmedSearch);

  const exactMatch = useMemo(
    () =>
      trimmedSearch.length > 0
        ? available.find((s) => nameKey(s.name) === searchKey)
        : undefined,
    [available, searchKey, trimmedSearch],
  );

  const alreadySelected = useMemo(
    () => trimmedSearch.length > 0 && selected.some((s) => nameKey(s.name) === searchKey),
    [selected, searchKey, trimmedSearch],
  );

  const canCreate =
    trimmedSearch.length > 0 &&
    !alreadySelected &&
    !exactMatch &&
    selectedCategories.length > 0;

  const filtered = useMemo(() => {
    const q = trimmedSearch.toLowerCase();
    return available.filter((s) => {
      if (selectedIds.has(s.id)) return false;
      if (!q) return true;
      return s.name.toLowerCase().includes(q);
    });
  }, [available, trimmedSearch, selectedIds]);

  function addItem(item: SelectedSubcategory) {
    if (selectedIds.has(item.id)) return;
    onChange([...selected, item]);
    setSearch("");
    setOpen(false);
    setCreateForCategoryId(null);
  }

  function removeId(id: number) {
    onChange(selected.filter((s) => s.id !== id));
  }

  async function handleCreate(categoryId: number) {
    if (!canCreate || creating || disabled) return;
    setCreating(true);
    try {
      const created = await createMutation.mutateAsync({
        name: trimmedSearch,
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

  async function handleEnter() {
    if (disabled || creating) return;
    if (exactMatch && !selectedIds.has(exactMatch.id)) {
      addItem({
        id: exactMatch.id,
        name: exactMatch.name,
        categoryId: exactMatch.categoryId,
      });
      return;
    }
    if (canCreate && selectedCategories.length === 1) {
      await handleCreate(selectedCategories[0].id);
    } else if (canCreate) {
      setCreateForCategoryId(selectedCategories[0]?.id ?? null);
      setOpen(true);
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

  return (
    <div className="space-y-2">
      <Label>Subcategorías del producto</Label>
      <p className="text-xs text-muted-foreground">
        Opcional. Solo se muestran las de las categorías seleccionadas.
      </p>
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
                  setCreateForCategoryId(null);
                }}
                onFocus={() => setOpen(true)}
                placeholder="Buscar subcategoría…"
                className="pl-9"
                disabled={disabled || isLoading}
                autoComplete="off"
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
            className="w-[var(--radix-popover-trigger-width)] p-0"
            align="start"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <Command shouldFilter={false}>
              <CommandList>
                <CommandEmpty>Sin resultados.</CommandEmpty>
                <CommandGroup>
                  {filtered.map((s) => (
                    <CommandItem
                      key={s.id}
                      value={String(s.id)}
                      onSelect={() =>
                        addItem({ id: s.id, name: s.name, categoryId: s.categoryId })
                      }
                    >
                      <span className="truncate">{s.name}</span>
                      <span className="ml-auto truncate text-xs text-muted-foreground">
                        {categoryNameById.get(s.categoryId) ?? s.categoryName}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
                {canCreate && selectedCategories.length === 1 ? (
                  <CommandGroup>
                    <CommandItem
                      value={`__create__${trimmedSearch}`}
                      onSelect={() => void handleCreate(selectedCategories[0].id)}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Crear «{trimmedSearch}» en {selectedCategories[0].name}
                    </CommandItem>
                  </CommandGroup>
                ) : null}
                {canCreate && selectedCategories.length > 1 ? (
                  <CommandGroup heading="Crear en categoría">
                    {selectedCategories.map((c) => (
                      <CommandItem
                        key={c.id}
                        value={`__create__${c.id}__${trimmedSearch}`}
                        onSelect={() => void handleCreate(c.id)}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        «{trimmedSearch}» → {c.name}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ) : null}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-10 w-10 shrink-0 rounded-full"
          disabled={disabled || creating || !canCreate}
          aria-label="Crear subcategoría"
          onClick={() => {
            if (selectedCategories.length === 1) {
              void handleCreate(selectedCategories[0].id);
            } else {
              setOpen(true);
              setCreateForCategoryId(selectedCategories[0]?.id ?? null);
            }
          }}
        >
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        </Button>
      </div>

      {createForCategoryId != null && canCreate && selectedCategories.length > 1 ? (
        <p className="text-xs text-muted-foreground">
          Elige en el menú en qué categoría crear «{trimmedSearch}».
        </p>
      ) : null}

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
