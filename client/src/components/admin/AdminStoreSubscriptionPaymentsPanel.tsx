import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type StorePaymentRow = {
  id: number | string;
  userId: string;
  userName: string;
  userEmail: string | null;
  storeId: number;
  storeName: string;
  storeSlug: string;
  amount: string | number;
  status: string;
  subscriptionMonths: number;
  subscriptionMonthlyUsd: number;
  transferReceiptCode: string | null;
  transferDate: string | null;
  createdAt: string | null;
};

type AdminStoreSubscriptionPaymentsPanelProps = {
  enabled: boolean;
};

async function fetchWithAuth(url: string) {
  const token = localStorage.getItem("token");
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message ?? "Error de red");
  }
  return res.json();
}

export function AdminStoreSubscriptionPaymentsPanel({ enabled }: AdminStoreSubscriptionPaymentsPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<"" | "pending" | "completed" | "rejected">("pending");
  const [rejectId, setRejectId] = useState<number | string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-store-subscription-payments", statusFilter],
    queryFn: () =>
      fetchWithAuth(
        statusFilter
          ? `/api/admin/store-subscription-payments?status=${statusFilter}`
          : "/api/admin/store-subscription-payments",
      ) as Promise<{ items: StorePaymentRow[] }>,
    enabled,
  });

  const reviewMutation = useMutation({
    mutationFn: async (args: { reportId: number | string; action: "approve" | "reject"; reason?: string }) => {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/admin/store-subscription-payments/${args.reportId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          action: args.action,
          ...(args.action === "reject" ? { reason: args.reason } : {}),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudo revisar");
      }
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-store-subscription-payments"] });
      setRejectId(null);
      setRejectReason("");
      toast({ title: "Listo", description: "Revisión registrada." });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const items = data?.items ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pagos de tiendas</CardTitle>
        <CardDescription>
          Comprobantes de mensualidad de visibilidad de tiendas online. Aprueba o rechaza como en suscripciones de
          asociados.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {(["pending", "completed", "rejected", ""] as const).map((s) => (
            <Button
              key={s || "all"}
              size="sm"
              variant={statusFilter === s ? "default" : "outline"}
              onClick={() => setStatusFilter(s)}
            >
              {s === "pending" ? "Pendientes" : s === "completed" ? "Aprobados" : s === "rejected" ? "Rechazados" : "Todos"}
            </Button>
          ))}
        </div>

        {isLoading ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No hay comprobantes en esta categoría.</p>
        ) : (
          <div className="space-y-3">
            {items.map((row) => (
              <div key={String(row.id)} className="rounded-lg border border-border p-4 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{row.storeName}</p>
                    <p className="text-sm text-muted-foreground">
                      {row.userName}
                      {row.userEmail ? ` · ${row.userEmail}` : ""}
                    </p>
                  </div>
                  <Badge variant={row.status === "pending" ? "secondary" : row.status === "completed" ? "default" : "destructive"}>
                    {row.status === "pending" ? "Pendiente" : row.status === "completed" ? "Aprobado" : "Rechazado"}
                  </Badge>
                </div>
                <div className="text-sm grid gap-1 sm:grid-cols-2">
                  <span>
                    Monto: <strong>{row.amount} USD</strong> ({row.subscriptionMonths} mes
                    {row.subscriptionMonths === 1 ? "" : "es"})
                  </span>
                  <span>Código: {row.transferReceiptCode ?? "—"}</span>
                  <span>Fecha transferencia: {row.transferDate ?? "—"}</span>
                  <span>Slug: /tienda/{row.storeSlug}</span>
                </div>
                {row.status === "pending" && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button
                      size="sm"
                      disabled={reviewMutation.isPending}
                      onClick={() => reviewMutation.mutate({ reportId: row.id, action: "approve" })}
                    >
                      <Check className="h-4 w-4 mr-1" /> Aprobar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={reviewMutation.isPending}
                      onClick={() => {
                        setRejectId(row.id);
                        setRejectReason("");
                      }}
                    >
                      <X className="h-4 w-4 mr-1" /> Rechazar
                    </Button>
                  </div>
                )}
                {rejectId === row.id && (
                  <div className="pt-2 space-y-2 border-t border-border mt-2">
                    <Textarea
                      placeholder="Motivo del rechazo (mín. 3 caracteres)"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={reviewMutation.isPending || rejectReason.trim().length < 3}
                        onClick={() =>
                          reviewMutation.mutate({
                            reportId: row.id,
                            action: "reject",
                            reason: rejectReason.trim(),
                          })
                        }
                      >
                        Confirmar rechazo
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setRejectId(null)}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
