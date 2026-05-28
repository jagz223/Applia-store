import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { FileText, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { useProviderSubscriptionMonthlyUsd } from "@/hooks/use-provider-subscription-monthly-usd";
import { downloadInvoicePdf } from "@/lib/invoice-pdf";
import type { SubscriptionInvoiceListItem } from "@shared/subscription-invoice";
import { SubscriptionInvoiceRow } from "@/components/subscription/SubscriptionInvoiceRow";
import { cn } from "@/lib/utils";

type SubscriptionInvoicesPanelProps = {
  cardClassName?: string;
  enabled?: boolean;
};

export function SubscriptionInvoicesPanel({
  cardClassName,
  enabled = true,
}: SubscriptionInvoicesPanelProps) {
  const { user } = useAuth();
  const [location] = useLocation();
  const [pulseReportId, setPulseReportId] = useState<number | null>(null);
  const autoVerificationPdfDone = useRef(false);
  const { monthlyUsd } = useProviderSubscriptionMonthlyUsd({ enabled: !!user });

  const { data: invoiceList, isLoading } = useQuery({
    queryKey: ["/api/invoices", "list"],
    queryFn: async () => {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch("/api/invoices", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("No se pudieron cargar las facturas");
      return res.json() as Promise<SubscriptionInvoiceListItem[]>;
    },
    enabled: enabled && !!user,
  });

  const verificationRows = useMemo(
    () => (invoiceList ?? []).filter((inv) => inv.type === "verification"),
    [invoiceList],
  );

  const userForInvoice = user
    ? {
        firstName: user.firstName,
        lastName: user.lastName,
        name: (user as { name?: string }).name,
        email: user.email,
      }
    : null;

  useEffect(() => {
    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    if (params.get("verificationInvoice") !== "1") {
      setPulseReportId(null);
      return;
    }
    const rid = params.get("reportId");
    if (rid != null && rid !== "") {
      const n = Number(rid);
      if (!Number.isNaN(n)) setPulseReportId(n);
    }
  }, [location]);

  useEffect(() => {
    if (pulseReportId != null) return;
    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    if (params.get("verificationInvoice") !== "1") return;
    const completed = verificationRows.find((r) => r.status === "completed");
    const id = completed?.reportId ?? completed?.id;
    if (id != null) setPulseReportId(Number(id));
  }, [verificationRows, pulseReportId, location]);

  useEffect(() => {
    if (pulseReportId == null) return;
    let cancelled = false;
    let attempts = 0;
    const attemptScroll = () => {
      if (cancelled) return;
      attempts += 1;
      const el = document.querySelector(`[data-verification-report="${pulseReportId}"]`) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      if (attempts < 25) window.setTimeout(attemptScroll, 120);
    };
    window.setTimeout(attemptScroll, 100);
    return () => {
      cancelled = true;
    };
  }, [pulseReportId, location, verificationRows.length]);

  useEffect(() => {
    if (!invoiceList || !user || autoVerificationPdfDone.current) return;
    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    if (params.get("verificationInvoice") !== "1") return;
    const ridParam = params.get("reportId");
    const match = verificationRows.find(
      (r) =>
        r.status === "completed" &&
        (ridParam == null || ridParam === "" || String(r.reportId ?? r.id) === ridParam),
    );
    if (!match) return;
    autoVerificationPdfDone.current = true;
    const reportId = match.reportId ?? match.id;
    if (reportId == null) return;
    const amt =
      typeof match.amount === "number" ? match.amount : parseFloat(String(match.amount ?? String(monthlyUsd)));
    void downloadInvoicePdf(
      {
        id: Number(reportId),
        reportId: Number(reportId),
        transferType: "verification_fee",
        amount: Number.isFinite(amt) ? amt : monthlyUsd,
        description: match.service ?? "Suscripción de visibilidad",
        createdAt: match.date,
        status: match.status,
      },
      {
        firstName: user.firstName,
        lastName: user.lastName,
        name: (user as { name?: string }).name,
        email: user.email,
      },
    ).then(() => {
      params.delete("verificationInvoice");
      params.delete("reportId");
      const qs = params.toString();
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
      }
    });
  }, [invoiceList, verificationRows, user, location, monthlyUsd]);

  if (isLoading) {
    return (
      <Card className={cn(cardClassName)}>
        <CardHeader>
          <CardTitle>Facturas</CardTitle>
          <CardDescription>
            Historial y descarga en PDF de tus pagos de mensualidad (visibilidad como asociado).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-10 gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm">Cargando facturas…</p>
        </CardContent>
      </Card>
    );
  }

  if (verificationRows.length === 0) {
    return (
      <Card className={cn(cardClassName)}>
        <CardHeader>
          <CardTitle>Facturas</CardTitle>
          <CardDescription>
            Historial y descarga en PDF de tus pagos de mensualidad (visibilidad como asociado).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-10 gap-3 text-muted-foreground">
          <FileText className="h-8 w-8 opacity-60" />
          <p className="text-sm text-center max-w-md">
            Aún no tienes pagos de suscripción registrados. Cuando envíes o aprueben un pago de visibilidad, verás aquí
            el monto, la fecha de aprobación y si usaste un código promocional.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn(cardClassName)}>
      <CardHeader>
        <CardTitle>Facturas</CardTitle>
        <CardDescription>
          Pagos de mensualidad de visibilidad: monto según tu categoría, fechas, código promocional y PDF sin
          impuestos.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {verificationRows.map((inv) => {
          const reportKey = inv.reportId ?? inv.id;
          const highlight = pulseReportId != null && Number(reportKey) === pulseReportId;
          return (
            <SubscriptionInvoiceRow
              key={`ver-${reportKey}`}
              invoice={inv}
              monthlyUsdFallback={monthlyUsd}
              userForInvoice={userForInvoice}
              highlight={highlight}
            />
          );
        })}
      </CardContent>
    </Card>
  );
}
