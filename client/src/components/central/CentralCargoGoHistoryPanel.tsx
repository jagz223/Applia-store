import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle, ChevronLeft, ChevronRight, Loader2, XCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchCentralCargoGoHistory } from "@/lib/central-cargo-go-history-api";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toDate, isValidDate } from "@/lib/date-utils";

const PAGE_SIZE = 10;

type HistoryBucket = "completed" | "cancelled";

type CentralCargoGoHistoryPanelProps = {
  companyId: string;
  enabled?: boolean;
  embedded?: boolean;
};

export function CentralCargoGoHistoryPanel({
  companyId,
  enabled = true,
  embedded = false,
}: CentralCargoGoHistoryPanelProps) {
  const [bucket, setBucket] = useState<HistoryBucket>("completed");
  const [pageByBucket, setPageByBucket] = useState<Record<HistoryBucket, number>>({
    completed: 1,
    cancelled: 1,
  });

  const currentPage = pageByBucket[bucket] ?? 1;

  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ["central-cargo-go-history", companyId, bucket, currentPage],
    queryFn: () =>
      fetchCentralCargoGoHistory({
        companyId,
        bucket,
        page: currentPage,
        limit: PAGE_SIZE,
      }),
    enabled: enabled && !!companyId,
  });

  const rides = data?.rides ?? [];
  const counts = data?.counts ?? { completed: 0, cancelled: 0 };
  const totalPages = data?.totalPages ?? 1;
  const safePage = data?.page ?? currentPage;
  const total = data?.total ?? 0;

  const badgeVariant = (status: string) => {
    if (status === "completed") return "default" as const;
    return "destructive" as const;
  };

  const content = (
    <>
      {isLoading ? (
        <div className="py-10 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Cargando historial…</span>
        </div>
      ) : isError ? (
        <p className="text-sm text-destructive text-center py-8">
          No se pudo cargar el historial de servicios Car Go.
        </p>
      ) : (
        <div className="space-y-4">
          <Tabs
            value={bucket}
            onValueChange={(v) => {
              setBucket(v as HistoryBucket);
            }}
          >
            <TabsList className="flex w-full flex-nowrap items-stretch gap-1 h-auto p-1 bg-muted/50 overflow-x-auto">
              <TabsTrigger value="completed" className="gap-2 py-2.5 data-[state=active]:bg-background">
                <CheckCircle className="h-4 w-4" />
                <span className="hidden sm:inline">Completados</span>
                <span className="sm:hidden">OK</span>
                <Badge variant="secondary" className="ml-1">
                  {counts.completed}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="cancelled" className="gap-2 py-2.5 data-[state=active]:bg-background">
                <XCircle className="h-4 w-4" />
                <span className="hidden sm:inline">Cancelados</span>
                <span className="sm:hidden">No</span>
                <Badge variant="secondary" className="ml-1">
                  {counts.cancelled}
                </Badge>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <p className="text-xs text-muted-foreground">
            Servicios de conductores afiliados a tu central. No se muestran datos del cliente.
          </p>

          {rides.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 py-12 text-center">
              <p className="text-muted-foreground text-sm">
                {bucket === "completed"
                  ? "No hay servicios completados en el historial de tu flota."
                  : "No hay servicios cancelados o expirados en el historial de tu flota."}
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {rides.map((r) => {
                  const when = toDate(r.endedAt);
                  const whenLabel = isValidDate(when)
                    ? format(when, "dd/MM/yyyy HH:mm", { locale: es })
                    : "—";
                  return (
                    <div
                      key={r.id}
                      className="rounded-xl border border-border bg-card p-4 space-y-2"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-sm">
                            {r.startLabel} → {r.endLabel}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {r.moduleLabel} · {r.vehicleLabel} · {whenLabel}
                          </p>
                          <p className="text-[10px] font-mono text-muted-foreground/90 mt-0.5">
                            ID: {r.id}
                          </p>
                        </div>
                        <Badge variant={badgeVariant(r.status)} className="shrink-0 self-start">
                          {r.statusLabel}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Conductor:{" "}
                        <span className="text-foreground">{r.driverName ?? "Sin asignar"}</span>
                        {" · "}
                        <span className="tabular-nums">${r.amountUsd.toFixed(2)} USD</span>
                        {" · "}
                        ~{r.durationMin} min
                      </p>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {total} servicio{total !== 1 ? "s" : ""} · Página {safePage} de {totalPages}
                  {isFetching ? " · actualizando…" : ""}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 sm:flex-none"
                    disabled={safePage <= 1}
                    onClick={() =>
                      setPageByBucket((prev) => ({
                        ...prev,
                        [bucket]: Math.max(1, safePage - 1),
                      }))
                    }
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 sm:flex-none"
                    disabled={safePage >= totalPages}
                    onClick={() =>
                      setPageByBucket((prev) => ({
                        ...prev,
                        [bucket]: Math.min(totalPages, safePage + 1),
                      }))
                    }
                  >
                    Siguiente
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );

  if (embedded) {
    return <div className="space-y-4">{content}</div>;
  }

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg">Historial Car Go</CardTitle>
        <CardDescription>
          Servicios completados y cancelados de todos los conductores de tu central (taxi y delivery).
        </CardDescription>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}
