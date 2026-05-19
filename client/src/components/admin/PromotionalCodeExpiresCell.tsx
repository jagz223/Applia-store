import {
  formatPromotionalCodeExpiresColumn,
  type PromotionalCodeRecord,
} from "@shared/promotional-code-utils";
import { cn } from "@/lib/utils";

type PromotionalCodeExpiresCellProps = {
  row: PromotionalCodeRecord;
  nowMs: number;
};

export function PromotionalCodeExpiresCell({ row, nowMs }: PromotionalCodeExpiresCellProps) {
  const expires = formatPromotionalCodeExpiresColumn(row, nowMs);

  return (
    <td className="p-3">
      <div
        className={cn(
          expires.isCountdown && "font-mono tabular-nums text-amber-600 dark:text-amber-400 font-semibold",
        )}
      >
        {expires.isCountdown ? `${expires.primary} restantes` : expires.primary}
      </div>
      {expires.secondary ? (
        <p className="text-xs text-muted-foreground mt-0.5">{expires.secondary}</p>
      ) : null}
    </td>
  );
}
