import { Badge } from "@/components/ui/badge";
import {
  Banknote,
  CheckCircle,
  ChevronRight,
  Clock,
  FileText,
  XCircle,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  formatAssociateActivityAmount,
  type AssociateDashboardActivityItem,
} from "@shared/associate-dashboard-activity";
import { cn } from "@/lib/utils";

function parseItemDate(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d : null;
}

function getStatusBadge(status: string) {
  switch (status) {
    case "completed":
    case "paid":
      return (
        <Badge className="badge-success">
          <CheckCircle className="mr-1 h-3 w-3" />
          Completado
        </Badge>
      );
    case "pending_approval":
    case "pending":
      return (
        <Badge className="badge-warning">
          <Clock className="mr-1 h-3 w-3" />
          Pendiente
        </Badge>
      );
    case "rejected":
    case "cancelled":
      return (
        <Badge className="badge-danger">
          <XCircle className="mr-1 h-3 w-3" />
          Rechazado
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

type AssociateActivityFeedProps = {
  items: AssociateDashboardActivityItem[];
  formatUsd: (amount: number) => string;
  emptyMessage?: string;
  onSelectItem?: (item: AssociateDashboardActivityItem) => void;
};

export function AssociateActivityFeed({
  items,
  formatUsd,
  emptyMessage = "Aún no hay actividad registrada en este resumen.",
  onSelectItem,
}: AssociateActivityFeedProps) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-10 text-muted-foreground">
        <Banknote className="h-8 w-8 opacity-60" />
        <p className="max-w-md text-center text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const createdAt = parseItemDate(item.dateIso);
        const dateStr = createdAt ? format(createdAt, "dd MMM yyyy HH:mm", { locale: es }) : "";
        const amountLabel = formatAssociateActivityAmount(item, formatUsd);
        const isSubscription = item.kind === "subscription";
        const isPayment = item.kind === "payment";
        const clickable = !!onSelectItem;

        const inner = (
          <>
            <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 sm:mt-0 sm:h-10 sm:w-10">
                <Banknote className="h-4 w-4 text-primary sm:h-5 sm:w-5" />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="break-words text-sm font-medium text-foreground sm:text-base">{item.title}</p>
                <p className="hyphens-auto break-words text-xs text-muted-foreground sm:text-sm">
                  {item.subtitle}
                </p>
              </div>
            </div>
            <div className="flex w-full min-w-0 flex-col gap-2 border-t border-border/60 pt-3 sm:max-w-[50%] sm:w-auto sm:items-end sm:border-0 sm:pt-0">
              <div className="flex w-full flex-wrap items-baseline justify-between gap-x-3 gap-y-1 sm:w-auto sm:flex-col sm:items-end sm:text-right">
                {amountLabel ? (
                  <p
                    className={cn(
                      "text-sm font-bold tabular-nums sm:text-base",
                      isSubscription || isPayment || item.amountMode === "agreed"
                        ? "text-foreground"
                        : "text-emerald-600",
                    )}
                  >
                    {amountLabel}
                  </p>
                ) : item.amountMode === "none" ? (
                  <p className="text-xs font-medium text-muted-foreground sm:text-sm">Servicio registrado</p>
                ) : null}
                {dateStr ? (
                  <p className="text-right text-[11px] text-muted-foreground break-all sm:break-normal sm:text-xs">
                    {dateStr}
                  </p>
                ) : null}
              </div>
              <div className="flex w-full flex-wrap items-center justify-between gap-2 min-[400px]:justify-end sm:w-auto">
                <div className="flex flex-wrap gap-2">
                  {isSubscription ? (
                    <Badge variant="secondary" className="gap-1 text-xs">
                      <FileText className="h-3 w-3 shrink-0" />
                      Mensualidad
                    </Badge>
                  ) : isPayment ? (
                    <Badge variant="secondary" className="text-xs">
                      Pago
                    </Badge>
                  ) : null}
                  {getStatusBadge(item.status)}
                </div>
                {clickable ? (
                  <span className="inline-flex items-center gap-0.5 text-xs font-medium text-primary">
                    Ver resumen
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  </span>
                ) : null}
              </div>
            </div>
          </>
        );

        if (clickable) {
          return (
            <button
              key={item.id}
              type="button"
              className="flex min-w-0 w-full cursor-pointer flex-col gap-3 rounded-lg border border-border bg-background/50 p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 min-[380px]:gap-4 min-[380px]:p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-5"
              onClick={() => onSelectItem?.(item)}
              aria-label={`Ver resumen: ${item.title}`}
            >
              {inner}
            </button>
          );
        }

        return (
          <div
            key={item.id}
            className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-background/50 p-3 min-[380px]:gap-4 min-[380px]:p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-5"
          >
            {inner}
          </div>
        );
      })}
    </div>
  );
}
