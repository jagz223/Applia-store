import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Download, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { downloadInvoicePdf, type UserForInvoice } from "@/lib/invoice-pdf";
import {
  parseSubscriptionInvoiceAmount,
  subscriptionInvoicePromoSummary,
  subscriptionInvoicePurposeLabel,
  subscriptionInvoiceStatusLabel,
  type SubscriptionInvoiceListItem,
} from "@shared/subscription-invoice";
import { toDate } from "@/lib/date-utils";

function formatUsd(amount: number): string {
  return new Intl.NumberFormat("es-EC", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatInvoiceDate(value: unknown): string {
  const d = toDate(value);
  return d ? format(d, "dd MMM yyyy HH:mm", { locale: es }) : "—";
}

type SubscriptionInvoiceRowProps = {
  invoice: SubscriptionInvoiceListItem;
  monthlyUsdFallback?: number;
  userForInvoice: UserForInvoice | null;
  highlight?: boolean;
  className?: string;
};

export function SubscriptionInvoiceRow({
  invoice,
  monthlyUsdFallback = 15,
  userForInvoice,
  highlight = false,
  className,
}: SubscriptionInvoiceRowProps) {
  const reportKey = invoice.reportId ?? invoice.id;
  if (reportKey == null) return null;

  const amount = parseSubscriptionInvoiceAmount(invoice.amount, monthlyUsdFallback);
  const st = invoice.status ?? "";
  const isCompleted = st === "completed";
  const isRejected = st === "rejected";
  const purpose = subscriptionInvoicePurposeLabel(invoice);
  const promoLine = subscriptionInvoicePromoSummary(invoice);
  const registeredAt = formatInvoiceDate(invoice.date);
  const approvedAt =
    invoice.status === "completed" ? formatInvoiceDate(invoice.approvedAt ?? invoice.date) : null;

  return (
    <div
      data-verification-report={reportKey}
      className={cn(
        "flex flex-col gap-3 rounded-lg border border-border bg-card p-3 min-[380px]:flex-row min-[380px]:items-start min-[380px]:justify-between min-[380px]:p-4",
        highlight && "ring-2 ring-primary ring-offset-2 ring-offset-background",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3 flex-1">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-sm font-medium text-foreground">{purpose}</p>
          {promoLine ? (
            <p className="text-xs leading-relaxed text-primary/90">{promoLine}</p>
          ) : null}
          <dl className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2 sm:gap-x-4">
            <div>
              <dt className="inline font-medium text-foreground/80">Monto: </dt>
              <dd className="inline tabular-nums font-semibold text-foreground">{formatUsd(amount)}</dd>
            </div>
            <div>
              <dt className="inline font-medium text-foreground/80">Registrado: </dt>
              <dd className="inline">{registeredAt}</dd>
            </div>
            {approvedAt ? (
              <div className="sm:col-span-2">
                <dt className="inline font-medium text-foreground/80">Aprobado: </dt>
                <dd className="inline">{approvedAt}</dd>
              </div>
            ) : null}
            {invoice.transferReceiptCode ? (
              <div className="sm:col-span-2">
                <dt className="inline font-medium text-foreground/80">Comprobante: </dt>
                <dd className="inline font-mono">{invoice.transferReceiptCode}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      </div>
      <div className="flex flex-col gap-2 border-t border-border/60 pt-3 min-[400px]:shrink-0 min-[400px]:flex-row min-[400px]:flex-wrap min-[400px]:items-center min-[400px]:justify-end min-[400px]:border-0 min-[400px]:pt-0">
        <Badge variant={isCompleted ? "default" : isRejected ? "destructive" : "secondary"} className="w-fit">
          {subscriptionInvoiceStatusLabel(st)}
        </Badge>
        <Button
          variant="outline"
          size="sm"
          className="w-full min-[400px]:w-auto shrink-0"
          onClick={() =>
            userForInvoice &&
            downloadInvoicePdf(
              {
                id: Number(reportKey),
                reportId: Number(reportKey),
                transferType: "verification_fee",
                amount,
                description: purpose,
                createdAt: invoice.date ?? null,
                status: invoice.status,
              },
              userForInvoice,
            )
          }
          disabled={!userForInvoice || !isCompleted}
        >
          <Download className="mr-2 h-4 w-4" />
          Descargar factura
        </Button>
      </div>
    </div>
  );
}
