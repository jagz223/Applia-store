import * as React from "react";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
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

const DEFAULT_MAX = 20;

type Props = {
  value: string;
  onChange: (value: string) => void;
  /** Lista completa en memoria; solo se pintan hasta `maxVisible` filas según el texto. */
  options: string[];
  /** Cuántas filas mostrar como máximo (evita lag en DOM). Por defecto 20. */
  maxVisible?: number;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  isLoading?: boolean;
  className?: string;
  id?: string;
};

export function VehicleSearchCombobox({
  value,
  onChange,
  options,
  maxVisible = DEFAULT_MAX,
  placeholder = "Buscar y elegir…",
  searchPlaceholder = "Escribe para filtrar…",
  emptyMessage = "Sin resultados.",
  disabled,
  isLoading,
  className,
  id,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  React.useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const displayed = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return options.slice(0, maxVisible);
    }
    return options.filter((o) => o.toLowerCase().includes(q)).slice(0, maxVisible);
  }, [options, query, maxVisible]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || isLoading}
          className={cn("w-full justify-between font-normal", !value && "text-muted-foreground", className)}
        >
          <span className="truncate text-left">
            {isLoading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                Cargando…
              </span>
            ) : value ? (
              value
            ) : (
              placeholder
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        layer="modal"
        className="w-[var(--radix-popover-trigger-width)] min-w-[min(100vw-2rem,22rem)] p-0"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={searchPlaceholder}
            className="h-10"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>{isLoading ? "Cargando…" : emptyMessage}</CommandEmpty>
            <CommandGroup>
              {displayed.map((opt, idx) => (
                <CommandItem
                  key={`${opt}-${idx}`}
                  value={opt}
                  onSelect={(raw) => {
                    const sel = String(raw ?? "");
                    const exact =
                      displayed.find((o) => o.toLowerCase() === sel.toLowerCase()) ??
                      options.find((o) => o.toLowerCase() === sel.toLowerCase()) ??
                      sel;
                    onChange(value === exact ? "" : exact);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === opt ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{opt}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
