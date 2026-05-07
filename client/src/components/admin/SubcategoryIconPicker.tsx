import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { SUBCATEGORY_LUCIDE_PICKLIST } from "@shared/subcategory-lucide-picklist";
import { CategoryIcon } from "@/components/CategoryIcon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (iconName: string) => void;
  /** Iconos ya usados por otras subcategorías de la misma categoría (no incluir la fila en edición). */
  takenIconNames: ReadonlySet<string>;
  disabled?: boolean;
  id?: string;
};

export function SubcategoryIconPicker({ value, onChange, takenIconNames, disabled, id }: Props) {
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return SUBCATEGORY_LUCIDE_PICKLIST;
    return SUBCATEGORY_LUCIDE_PICKLIST.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.labelEs.toLowerCase().includes(q)
    );
  }, [filter]);

  const legacyValue =
    value &&
    !SUBCATEGORY_LUCIDE_PICKLIST.some((e) => e.name === value)
      ? value
      : null;

  const isDisabledChoice = (name: string) => takenIconNames.has(name) && name !== value;

  return (
    <div className="space-y-2" id={id}>
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-end sm:justify-between">
        <Label className="text-sm font-medium">Icono (Lucide)</Label>
        <div className="relative w-full sm:max-w-[220px]">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Buscar por nombre o uso…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-9 pl-8"
            disabled={disabled}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Los iconos atenuados ya están asignados a otra subcategoría de esta categoría. Elige uno distinto.
      </p>
      {legacyValue ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-100">
          Icono guardado fuera de esta lista:{" "}
          <span className="font-mono font-medium">{legacyValue}</span>. Sigue vigente hasta que elijas uno de la cuadrícula.
        </div>
      ) : null}
      <ScrollArea className="h-[min(220px,40vh)] rounded-lg border border-border bg-muted/20 p-2">
        <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-7 md:grid-cols-8">
          {legacyValue && (filter.trim() === "" || legacyValue.toLowerCase().includes(filter.trim().toLowerCase())) ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange(legacyValue)}
                  className={cn(
                    "flex aspect-square items-center justify-center rounded-lg border text-foreground transition-colors",
                    value === legacyValue
                      ? "border-amber-500 bg-amber-500/15 ring-2 ring-amber-500/30"
                      : "border-amber-500/50 bg-amber-500/5 hover:bg-amber-500/10"
                  )}
                  aria-label={`Mantener icono ${legacyValue}`}
                >
                  <CategoryIcon name={legacyValue} className="h-5 w-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[220px] text-xs">
                <span className="font-medium">Actual (legado)</span>
                <span className="block font-mono">{legacyValue}</span>
              </TooltipContent>
            </Tooltip>
          ) : null}
          {filtered.map((entry) => {
            const taken = isDisabledChoice(entry.name);
            const selected = value === entry.name;
            return (
              <Tooltip key={entry.name}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    disabled={disabled || taken}
                    onClick={() => onChange(entry.name)}
                    className={cn(
                      "flex aspect-square items-center justify-center rounded-lg border text-foreground transition-colors",
                      selected
                        ? "border-primary bg-primary/15 ring-2 ring-primary/30"
                        : "border-border bg-background hover:bg-muted/80",
                      taken && "cursor-not-allowed opacity-35 hover:bg-background",
                      disabled && "opacity-50"
                    )}
                    aria-label={entry.labelEs}
                    aria-pressed={selected}
                  >
                    <CategoryIcon name={entry.name} className="h-5 w-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[220px] text-xs">
                  <span className="font-medium">{entry.name}</span>
                  <span className="block text-muted-foreground">{entry.labelEs}</span>
                  {taken ? <span className="block text-amber-600 dark:text-amber-400">Ya en uso</span> : null}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
        {filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Ningún icono coincide con la búsqueda.</p>
        ) : null}
      </ScrollArea>
      {value ? (
        <p className="text-xs text-muted-foreground">
          Seleccionado: <span className="font-mono text-foreground">{value}</span>
        </p>
      ) : null}
    </div>
  );
}
