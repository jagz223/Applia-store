import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle, ChevronLeft, ChevronRight, Loader2, PlayCircle, XCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchCargoGoRidesAdmin } from "@/lib/mobility-ride-history-api";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toDate, isValidDate } from "@/lib/date-utils";

const PAGE_SIZE = 10;

type CargoSubTab = "active" | "completed" | "cancelled";

type AdminCargoGoRidesPanelProps = {
  enabled: boolean;
};

export function AdminCargoGoRidesPanel({ enabled }: AdminCargoGoRidesPanelProps) {
  const [subTab, setSubTab] = useState<CargoSubTab>("active");
  const [pageByTab, setPageByTab] = useState<Record<CargoSubTab, number>>({
    active: 1,
    completed: 1,
    cancelled: 1,
  });

  const currentPage = pageByTab[subTab] ?? 1;

  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ["admin-cargo-go-rides", subTab, currentPage],
    queryFn: () =>
      fetchCargoGoRidesAdmin({
        bucket: subTab,
        page: currentPage,
        limit: PAGE_SIZE,
      }),
    enabled,
    refetchInterval: subTab === "active" && enabled ? 15_000 : false,
  });

  const rides = data?.rides ?? [];
  const counts = data?.counts ?? { active: 0, completed: 0, cancelled: 0 };
  const totalPages = data?.totalPages ?? 1;
  const safePage = data?.page ?? currentPage;
  const total = data?.total ?? 0;

  const badgeVariant = (status: string) => {
    if (status === "completed") return "default" as const;
    if (status === "cancelled" || status === "expired") return "destructive" as const;
    return "secondary" as const;
  };

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Car Go — servicios en tiempo real</CardTitle>
        <CardDescription>
          En curso se consultan en vivo. Completados y cancelados quedan guardados en la base de datos de
          forma permanente (no se pierden al reiniciar el servidor).
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-10 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Cargando servicios Car Go…</span>
          </div>
        ) : isError ? (
          <p className="text-sm text-destructive text-center py-8">
            No se pudieron cargar los servicios Car Go.
          </p>
        ) : (
          <div className="space-y-4">
            <Tabs
              value={subTab}
              onValueChange={(v) => {
                setSubTab(v as CargoSubTab);
              }}
            >
              <TabsList className="flex w-full flex-nowrap items-stretch gap-1 h-auto p-1 bg-muted/50 overflow-x-auto">
                <TabsTrigger value="active" className="gap-2 py-2.5 data-[state=active]:bg-background">
                  <PlayCircle className="h-4 w-4" />
                  <span className="hidden sm:inline">En curso</span>
                  <Badge variant="secondary" className="ml-1">
                    {counts.active}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="completed" className="gap-2 py-2.5 data-[state=active]:bg-background">
                  <CheckCircle className="h-4 w-4" />
                  <span className="hidden sm:inline">Completados</span>
                  <Badge variant="secondary" className="ml-1">
                    {counts.completed}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="cancelled" className="gap-2 py-2.5 data-[state=active]:bg-background">
                  <XCircle className="h-4 w-4" />
                  <span className="hidden sm:inline">Cancelados / expirados</span>
                  <Badge variant="secondary" className="ml-1">
                    {counts.cancelled}
                  </Badge>
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {rides.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/30 py-12 text-center">
                <p className="text-muted-foreground text-sm">
                  {subTab === "active"
                    ? "No hay servicios Car Go en curso en este momento."
                    : subTab === "completed"
                      ? "No hay servicios Car Go completados en el historial."
                      : "No hay servicios Car Go cancelados o expirados en el historial."}
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  {rides.map((r) => {
                    const when = toDate(r.createdAt);
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
                              ID: <span className="font-mono">{r.id}</span> · {r.vehicleLabel} · {whenLabel}
                            </p>
                          </div>
                          <Badge variant={badgeVariant(r.status)} className="shrink-0 self-start">
                            {r.statusLabel}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Pasajero: <span className="text-foreground">{r.riderName}</span>
                          {r.driverName ? (
                            <>
                              {" "}
                              · Conductor: <span className="text-foreground">{r.driverName}</span>
                            </>
                          ) : (
                            <span className="italic"> · Sin conductor asignado</span>
                          )}
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
                        setPageByTab((prev) => ({
                          ...prev,
                          [subTab]: Math.max(1, safePage - 1),
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
                        setPageByTab((prev) => ({
                          ...prev,
                          [subTab]: Math.min(totalPages, safePage + 1),
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
      </CardContent>
    </Card>
  );
}
