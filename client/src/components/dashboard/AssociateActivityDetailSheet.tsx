import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { AssociateDashboardActivityItem } from "@shared/associate-dashboard-activity";
import {
  brandDisplayName,
  formatAssociateActivityAmount,
} from "@shared/associate-dashboard-activity";
import { format } from "date-fns";
import { es } from "date-fns/locale";

type AssociateActivityDetailSheetProps = {
  item: AssociateDashboardActivityItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formatUsd: (amount: number) => string;
};

export function AssociateActivityDetailSheet({
  item,
  open,
  onOpenChange,
  formatUsd,
}: AssociateActivityDetailSheetProps) {
  const amountLabel = item ? formatAssociateActivityAmount(item, formatUsd) : null;
  const completedLabel =
    item?.dateIso && Number.isFinite(new Date(item.dateIso).getTime())
      ? format(new Date(item.dateIso), "dd MMM yyyy · HH:mm", { locale: es })
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90vh,720px)] max-w-lg overflow-y-auto sm:max-w-xl">
        {item ? (
          <>
            <DialogHeader className="space-y-2 text-left">
              <DialogTitle className="pr-8 text-base leading-snug sm:text-lg">{item.title}</DialogTitle>
              <DialogDescription className="text-sm text-foreground/80">{item.subtitle}</DialogDescription>
              <div className="flex flex-wrap gap-2 pt-1">
                <Badge variant="secondary">{brandDisplayName(item.brand)}</Badge>
                {item.listTab === "transactions" ? (
                  <Badge variant="outline">Transacción</Badge>
                ) : (
                  <Badge variant="outline">Servicio</Badge>
                )}
                {completedLabel ? (
                  <Badge variant="outline" className="font-normal">
                    {completedLabel}
                  </Badge>
                ) : null}
                {amountLabel ? (
                  <Badge variant="outline" className="font-semibold tabular-nums">
                    {amountLabel}
                  </Badge>
                ) : null}
              </div>
            </DialogHeader>
            <Separator className="my-4" />
            {item.detail?.rows?.length ? (
              <dl className="space-y-3.5">
                {item.detail.rows.map((r) => (
                  <div
                    key={`${r.label}-${r.value}`}
                    className="grid gap-1 border-b border-border/50 pb-3 last:border-0 last:pb-0 sm:grid-cols-[minmax(8.5rem,36%)_1fr] sm:gap-4"
                  >
                    <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:text-sm sm:normal-case sm:tracking-normal">
                      {r.label}
                    </dt>
                    <dd className="text-sm leading-relaxed text-foreground break-words">{r.value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">
                No hay más detalle disponible para este registro.
              </p>
            )}
          </>
        ) : (
          <DialogHeader className="sr-only">
            <DialogTitle>Resumen de actividad</DialogTitle>
          </DialogHeader>
        )}
      </DialogContent>
    </Dialog>
  );
}
