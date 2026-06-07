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
import { cn } from "@/lib/utils";

export type SelectedEntity = { id: number; name: string };

type StoreEntityMultiPickerProps = {
  label: string;
  placeholder: string;
  emptyHint: string;
  selected: SelectedEntity[];
  onChange: (next: SelectedEntity[]) => void;
  options: SelectedEntity[];
  isLoading?: boolean;
  disabled?: boolean;
};

export function StoreEntityMultiPicker({
  label,
  placeholder,
  emptyHint,
  selected,
  onChange,
  options,
  isLoading,
  disabled,
}: StoreEntityMultiPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selectedIds = useMemo(() => new Set(selected.map((s) => s.id)), [selected]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return options.filter((opt) => {
      if (selectedIds.has(opt.id)) return false;
      if (!q) return true;
      return opt.name.toLowerCase().includes(q);
    });
  }, [options, search, selectedIds]);

  function add(item: SelectedEntity) {
    if (selectedIds.has(item.id)) return;
    onChange([...selected, item]);
    setSearch("");
  }

  function remove(id: number) {
    onChange(selected.filter((s) => s.id !== id));
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start font-normal"
            disabled={disabled || isLoading}
          >
            <Search className="h-4 w-4 mr-2 shrink-0 text-muted-foreground" />
            {placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
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
                <CommandEmpty>{search.trim() ? "Sin coincidencias" : emptyHint}</CommandEmpty>
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
            <li key={item.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="truncate">{item.name}</span>
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
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">Ninguno seleccionado.</p>
      )}
    </div>
  );
}
