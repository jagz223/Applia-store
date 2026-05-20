import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function CompanyCombobox({
  companies,
  value,
  onChange,
  search,
  onSearchChange,
  compact = false,
  /** Altura máx. de la lista (p. ej. `max-h-[200px]` para ~5 ítems visibles). */
  commandListClassName,
}: {
  companies: { id: string; name: string }[];
  value: string | null;
  onChange: (id: string | null) => void;
  search: string;
  onSearchChange: (s: string) => void;
  compact?: boolean;
  commandListClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = companies.find((c) => c.id === value);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) => c.name.toLowerCase().includes(q));
  }, [companies, search]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "justify-between font-normal shadow-sm",
            compact ? "h-9 w-full text-xs" : "w-full max-w-sm",
          )}
        >
          <span className="truncate">{selected?.name ?? "Seleccionar central…"}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        layer="modal"
        className="w-[min(320px,calc(100vw-2rem))] border-border bg-popover p-0 text-popover-foreground shadow-lg"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput placeholder="Buscar empresa…" value={search} onValueChange={onSearchChange} />
          <CommandList className={cn("overflow-y-auto", commandListClassName)}>
            <CommandEmpty>Sin resultados</CommandEmpty>
            <CommandGroup>
              {filtered.map((c) => (
                <CommandItem
                  key={c.id}
                  value={c.id}
                  onSelect={() => {
                    onChange(c.id);
                    setOpen(false);
                  }}
                >
                  {c.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
