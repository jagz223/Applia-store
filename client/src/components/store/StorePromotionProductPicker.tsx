import { useMemo, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useStoreProducts } from "@/hooks/use-store-products";
import { cn } from "@/lib/utils";

export type SelectedPromotionProduct = {
  id: number;
  name: string;
  quantity: number;
  status: "active" | "inactive";
};

type StorePromotionProductPickerProps = {
  storeId: number;
  selected: SelectedPromotionProduct[];
  onChange: (next: SelectedPromotionProduct[]) => void;
  disabled?: boolean;
};

export function StorePromotionProductPicker({
  storeId,
  selected,
  onChange,
  disabled,
}: StorePromotionProductPickerProps) {
  const { data: products = [], isLoading } = useStoreProducts(storeId);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selectedIds = useMemo(() => new Set(selected.map((s) => s.id)), [selected]);

  const options = useMemo(() => products.map((p) => ({ id: p.id, name: p.name })), [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return options.filter((opt) => {
      if (selectedIds.has(opt.id)) return false;
      if (!q) return true;
      return opt.name.toLowerCase().includes(q);
    });
  }, [options, search, selectedIds]);

  function add(item: { id: number; name: string }) {
    if (selectedIds.has(item.id)) return;
    onChange([...selected, { id: item.id, name: item.name, quantity: 1, status: "active" }]);
    setSearch("");
  }

  function remove(id: number) {
    onChange(selected.filter((s) => s.id !== id));
  }

  function setQuantity(id: number, raw: string) {
    const parsed = Number.parseInt(raw, 10);
    const quantity = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 9999) : 1;
    onChange(selected.map((s) => (s.id === id ? { ...s, quantity } : s)));
  }

  return (
    <div className="space-y-2">
      <Label>Productos de la promoción</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start font-normal"
            disabled={disabled || isLoading}
          >
            <Search className="h-4 w-4 mr-2 shrink-0 text-muted-foreground" />
            Buscar y añadir productos…
          </Button>
        </PopoverTrigger>
        <PopoverContent layer="modal" className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <div className="p-2 border-b border-border">
            <Input
              placeholder="Escribe para filtrar…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          <Command shouldFilter={false}>
            <CommandList className="max-h-56">
              {isLoading ? (
                <div className="py-6 flex justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : filtered.length === 0 ? (
                <CommandEmpty>{search.trim() ? "Sin coincidencias" : "No hay más productos disponibles"}</CommandEmpty>
              ) : (
                <CommandGroup>
                  {filtered.map((item) => (
                    <CommandItem key={item.id} value={String(item.id)} onSelect={() => add(item)}>
                      {item.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selected.length > 0 ? (
        <ul className="rounded-lg border border-border divide-y divide-border">
          {selected.map((item) => (
            <li key={item.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <span className="truncate flex-1 min-w-0">{item.name}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                <Label htmlFor={`promo-qty-${item.id}`} className="sr-only">
                  Cantidad de {item.name}
                </Label>
                <Input
                  id={`promo-qty-${item.id}`}
                  type="number"
                  min={1}
                  max={9999}
                  className="h-8 w-16 text-center px-1"
                  value={item.quantity}
                  disabled={disabled}
                  onChange={(e) => setQuantity(item.id, e.target.value)}
                />
                <button
                  type="button"
                  className={cn(
                    "shrink-0 rounded-full p-1 text-muted-foreground hover:text-foreground hover:bg-muted",
                    disabled && "opacity-50 pointer-events-none",
                  )}
                  aria-label={`Quitar ${item.name}`}
                  disabled={disabled}
                  onClick={() => remove(item.id)}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">Ningún producto seleccionado.</p>
      )}
    </div>
  );
}
