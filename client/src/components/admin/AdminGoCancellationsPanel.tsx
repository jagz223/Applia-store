import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Loader2, Star } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { fetchAdminGoCancellations, reviewAdminGoCancellation } from "@/lib/go-cancellation-feedback-api";
import { MOBILITY_UI } from "@shared/mobility-ui-labels";
import type { GoCancellationFeedbackRecord } from "@shared/go-cancellation-feedback";
import { isValidDate, toDate } from "@/lib/date-utils";

const PAGE_SIZE = 15;

type Props = { enabled: boolean };

function moduleLabel(m: string): string {
  return m === "pack" ? MOBILITY_UI.delivery : MOBILITY_UI.taxiService;
}

function partyLabel(row: GoCancellationFeedbackRecord): string {
  if (row.cancelledBy === "driver") return "Conductor";
  return row.module === "pack" ? "Cliente" : "Cliente";
}

function reviewBadge(row: GoCancellationFeedbackRecord) {
  if (row.adminReviewStatus === "penalty_applied") {
    return <Badge variant="destructive">Estrellas restadas</Badge>;
  }
  if (row.adminReviewStatus === "no_penalty") {
    return <Badge variant="secondary">Sin penalización</Badge>;
  }
  return <Badge variant="outline">Pendiente</Badge>;
}

export function AdminGoCancellationsPanel({ enabled }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [penaltyDraft, setPenaltyDraft] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ["admin-go-cancellations", page],
    queryFn: () => fetchAdminGoCancellations({ page, limit: PAGE_SIZE }),
    enabled,
    refetchInterval: enabled ? 30_000 : false,
  });

  const rows = data?.rows ?? [];
  const totalPages = data?.totalPages ?? 1;
  const total = data?.total ?? 0;

  const reviewMutation = useMutation({
    mutationFn: (input: { id: string; action: "no_penalty" | "penalty"; penaltyAmount?: number }) =>
      reviewAdminGoCancellation(input.id, { action: input.action, penaltyAmount: input.penaltyAmount }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-go-cancellations"] });
      toast({ title: "Revisión guardada" });
    },
    onError: (e: Error) => {
      toast({ title: "No se pudo guardar", description: e.message, variant: "destructive" });
    },
    onSettled: () => setBusyId(null),
  });

  const runReview = (id: string, action: "no_penalty" | "penalty") => {
    setBusyId(id);
    if (action === "no_penalty") {
      reviewMutation.mutate({ id, action });
      return;
    }
    const raw = penaltyDraft[id]?.trim().replace(",", ".");
    const amt = Number(raw);
    if (!Number.isFinite(amt) || amt <= 0) {
      setBusyId(null);
      toast({ title: "Monto inválido", description: "Indica cuánto restar del promedio.", variant: "destructive" });
      return;
    }
    reviewMutation.mutate({ id, action, penaltyAmount: amt });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cancelaciones Go</CardTitle>
        <CardDescription>
          Motivos reportados al cancelar taxi o delivery con conductor asignado o servicio en curso. Puedes restar
          estrellas al usuario que canceló o marcar sin penalización.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Cargando cancelaciones…</span>
          </div>
        ) : isError ? (
          <p className="py-8 text-center text-sm text-destructive">No se pudieron cargar los registros.</p>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Aún no hay cancelaciones con motivo.</p>
        ) : (
          <div className="space-y-4">
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[960px] text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="p-3 font-medium">Fecha</th>
                    <th className="p-3 font-medium">Servicio</th>
                    <th className="p-3 font-medium">Quién canceló</th>
                    <th className="p-3 font-medium">Motivo</th>
                    <th className="p-3 font-medium">Explicación</th>
                    <th className="p-3 font-medium">Usuario</th>
                    <th className="p-3 font-medium">Calificación</th>
                    <th className="p-3 font-medium">Estado</th>
                    <th className="p-3 font-medium text-right">Acción admin</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const created = toDate(row.createdAt);
                    const dateLabel = isValidDate(created)
                      ? format(created, "d MMM yyyy HH:mm", { locale: es })
                      : row.createdAt;
                    const pending = row.adminReviewStatus === "pending";
                    const busy = busyId === row.id && reviewMutation.isPending;
                    return (
                      <tr key={row.id} className="border-t align-top">
                        <td className="p-3 whitespace-nowrap text-muted-foreground">{dateLabel}</td>
                        <td className="p-3">{moduleLabel(row.module)}</td>
                        <td className="p-3">{partyLabel(row)}</td>
                        <td className="p-3 max-w-[180px]">
                          <p className="font-medium text-foreground">{row.reasonLabel}</p>
                          {row.driverPhase ? (
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {row.driverPhase === "at_pickup" ? "En punto de recogida" : "En camino"}
                            </p>
                          ) : null}
                        </td>
                        <td className="p-3 max-w-[220px] text-muted-foreground">{row.explanation}</td>
                        <td className="p-3">
                          <p className="font-medium">{row.cancellerName}</p>
                          <p className="text-xs text-muted-foreground truncate max-w-[140px]" title={row.cancellerUserId}>
                            {row.cancellerUserId}
                          </p>
                        </td>
                        <td className="p-3">
                          <span className="inline-flex items-center gap-1 tabular-nums">
                            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" aria-hidden />
                            {row.cancellerRatingAtCancel.toFixed(2)}
                            <span className="text-muted-foreground">({row.cancellerRatingCountAtCancel})</span>
                          </span>
                        </td>
                        <td className="p-3">{reviewBadge(row)}</td>
                        <td className="p-3">
                          {pending ? (
                            <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:justify-end">
                              <Input
                                type="text"
                                inputMode="decimal"
                                placeholder="Restar"
                                className="h-8 w-20 text-right tabular-nums"
                                value={penaltyDraft[row.id] ?? ""}
                                onChange={(e) =>
                                  setPenaltyDraft((s) => ({ ...s, [row.id]: e.target.value }))
                                }
                                disabled={busy}
                                aria-label="Estrellas a restar"
                              />
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                disabled={busy}
                                onClick={() => runReview(row.id, "penalty")}
                              >
                                Restar
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                onClick={() => runReview(row.id, "no_penalty")}
                              >
                                No bajar
                              </Button>
                            </div>
                          ) : (
                            <p className="text-right text-xs text-muted-foreground">
                              {row.adminReviewStatus === "penalty_applied" && row.penaltyAmount != null
                                ? `−${row.penaltyAmount.toFixed(2)}`
                                : "—"}
                            </p>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
              <span>
                {total} registro{total === 1 ? "" : "s"}
                {isFetching ? " · actualizando…" : ""}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="tabular-nums">
                  {page} / {totalPages}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
