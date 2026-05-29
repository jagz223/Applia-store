import type { CentralFleetDriver } from "@/hooks/use-central";
import { centralDriverReceivingModeLabel } from "@/lib/central-fleet-work-accent";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Props = {
  driver: CentralFleetDriver;
  /** Variante compacta para listados. */
  compact?: boolean;
};

export function CentralDriverReceivingBadge({ driver, compact = false }: Props) {
  const label = centralDriverReceivingModeLabel(driver);
  if (!label) return null;

  const isHybrid = label === "Modo híbrido";

  return (
    <Badge
      variant="secondary"
      className={cn(
        "text-xs font-normal",
        isHybrid && "border-emerald-500/35 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100",
        compact && "h-5 px-1.5 text-[10px]",
      )}
    >
      {label}
    </Badge>
  );
}
