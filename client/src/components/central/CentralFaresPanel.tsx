import { Loader2 } from "lucide-react";
import type { DispatchMobilityFares, DispatchPackFares } from "@shared/dispatch-company";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

function FareTierFields({
  label,
  perKm,
  minUsd,
  onPerKm,
  onMin,
}: {
  label: string;
  perKm: number;
  minUsd: number;
  onPerKm: (v: number) => void;
  onMin: (v: number) => void;
}) {
  return (
    <div className="grid gap-2 rounded-lg border border-border/60 bg-muted/15 p-3 sm:grid-cols-3 sm:items-end">
      <p className="text-sm font-medium sm:col-span-3">{label}</p>
      <div>
        <Label className="text-xs">USD / km</Label>
        <Input type="number" step="0.01" min={0} value={perKm} onChange={(e) => onPerKm(Number(e.target.value))} />
      </div>
      <div>
        <Label className="text-xs">Precio mínimo (USD)</Label>
        <Input type="number" step="0.01" min={0} value={minUsd} onChange={(e) => onMin(Number(e.target.value))} />
      </div>
    </div>
  );
}

type CentralFaresPanelProps = {
  mobilityDraft: DispatchMobilityFares | null;
  packDraft: DispatchPackFares | null;
  onMobilityChange: React.Dispatch<React.SetStateAction<DispatchMobilityFares | null>>;
  onPackChange: React.Dispatch<React.SetStateAction<DispatchPackFares | null>>;
  onSave: () => void;
  isSaving: boolean;
  embedded?: boolean;
  className?: string;
};

export function CentralFaresPanel({
  mobilityDraft,
  packDraft,
  onMobilityChange,
  onPackChange,
  onSave,
  isSaving,
  embedded = false,
  className,
}: CentralFaresPanelProps) {
  if (!mobilityDraft || !packDraft) return null;

  const cardClass = embedded ? "border-border/60 shadow-none" : "border-border/80";

  return (
    <div className={cn("space-y-4", className)}>
      <Card className={cardClass}>
        <CardHeader className={embedded ? "px-4 py-3" : undefined}>
          <CardTitle className="text-base">Taxi (movilidad)</CardTitle>
        </CardHeader>
        <CardContent className={cn("space-y-3", embedded && "px-4 pb-4 pt-0")}>
          {(
            [
              ["moto", "Moto"],
              ["auto", "Auto"],
              ["camioneta", "Camioneta"],
              ["pet_car", "Pet"],
            ] as const
          ).map(([key, label]) => (
            <FareTierFields
              key={key}
              label={label}
              perKm={mobilityDraft[key].perKmUsd}
              minUsd={mobilityDraft[key].minUsd}
              onPerKm={(v) => onMobilityChange((m) => (m ? { ...m, [key]: { ...m[key], perKmUsd: v } } : m))}
              onMin={(v) => onMobilityChange((m) => (m ? { ...m, [key]: { ...m[key], minUsd: v } } : m))}
            />
          ))}
        </CardContent>
      </Card>
      <Card className={cardClass}>
        <CardHeader className={embedded ? "px-4 py-3" : undefined}>
          <CardTitle className="text-base">Delivery</CardTitle>
        </CardHeader>
        <CardContent className={cn("space-y-3", embedded && "px-4 pb-4 pt-0")}>
          {(
            [
              ["moto", "Moto"],
              ["auto", "Auto"],
              ["camioneta", "Camioneta"],
            ] as const
          ).map(([key, label]) => (
            <FareTierFields
              key={key}
              label={label}
              perKm={packDraft[key].perKmUsd}
              minUsd={packDraft[key].minUsd}
              onPerKm={(v) => onPackChange((p) => (p ? { ...p, [key]: { ...p[key], perKmUsd: v } } : p))}
              onMin={(v) => onPackChange((p) => (p ? { ...p, [key]: { ...p[key], minUsd: v } } : p))}
            />
          ))}
        </CardContent>
      </Card>
      <Button disabled={isSaving} onClick={onSave} className={embedded ? "w-full" : undefined}>
        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar tarifas"}
      </Button>
    </div>
  );
}
