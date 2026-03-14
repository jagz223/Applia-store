import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, History, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { useWalletTransfers, type WalletTransfersParams } from "@/hooks/use-mango-data";
import { useAuth } from "@/hooks/use-auth";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toDate, isValidDate } from "@/lib/date-utils";

const PAGE_SIZE = 10;
const STATUS_LABELS: Record<string, string> = {
  pending_approval: "En aprobación",
  completed: "Completado",
  rejected: "Rechazado",
};

export default function Movimientos() {
  const { isAuthenticated } = useAuth();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<{
    dateFrom: string;
    dateTo: string;
    description: string;
    status: string;
    amountMin: string;
    amountMax: string;
  }>({
    dateFrom: "",
    dateTo: "",
    description: "",
    status: "",
    amountMin: "",
    amountMax: "",
  });

  const params: WalletTransfersParams = {
    page,
    limit: PAGE_SIZE,
    description: filters.description.trim() || undefined,
    status: filters.status ? (filters.status as WalletTransfersParams["status"]) : undefined,
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
    amountMin: filters.amountMin ? parseFloat(filters.amountMin) : undefined,
    amountMax: filters.amountMax ? parseFloat(filters.amountMax) : undefined,
  };
  if (Number.isNaN(params.amountMin)) params.amountMin = undefined;
  if (Number.isNaN(params.amountMax)) params.amountMax = undefined;

  const { data, isLoading } = useWalletTransfers(params);
  const transfers = data?.transfers ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters =
    filters.dateFrom ||
    filters.dateTo ||
    filters.description.trim() ||
    filters.status ||
    filters.amountMin ||
    filters.amountMax;

  const handleClearFilters = () => {
    setFilters({
      dateFrom: "",
      dateTo: "",
      description: "",
      status: "",
      amountMin: "",
      amountMax: "",
    });
    setPage(1);
  };

  if (!isAuthenticated) {
    return (
      <div className="container max-w-4xl py-12 px-4">
        <Card className="border-border bg-card">
          <CardContent className="pt-6">
            <p className="text-muted-foreground text-center mb-4">
              Debes iniciar sesión para ver el historial de movimientos.
            </p>
            <Button asChild className="w-full sm:w-auto">
              <Link href="/login">Iniciar sesión</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-5xl py-8 sm:py-12 px-4">
      <div className="mb-6">
        <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-primary" asChild>
          <Link href="/">
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Link>
        </Button>
      </div>

      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight flex items-center gap-2">
          <History className="h-8 w-8 text-primary" />
          Historial de movimientos
        </h1>
        <p className="text-muted-foreground mt-1">
          Listado de transferencias realizadas y recibidas.
        </p>
      </div>

      <Card className="border-border bg-card shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg">Filtros</CardTitle>
          <CardDescription>
            Filtra por fecha, descripción, estado o monto.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dateFrom">Desde fecha</Label>
              <Input
                id="dateFrom"
                type="date"
                value={filters.dateFrom}
                onChange={(e) => {
                  setFilters((f) => ({ ...f, dateFrom: e.target.value }));
                  setPage(1);
                }}
                className="bg-background border-border"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dateTo">Hasta fecha</Label>
              <Input
                id="dateTo"
                type="date"
                value={filters.dateTo}
                onChange={(e) => {
                  setFilters((f) => ({ ...f, dateTo: e.target.value }));
                  setPage(1);
                }}
                className="bg-background border-border"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Descripción</Label>
              <Input
                id="description"
                type="text"
                placeholder="Buscar en descripción"
                value={filters.description}
                onChange={(e) => {
                  setFilters((f) => ({ ...f, description: e.target.value }));
                  setPage(1);
                }}
                className="bg-background border-border"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Estado</Label>
              <Select
                value={filters.status || "all"}
                onValueChange={(v) => {
                  setFilters((f) => ({ ...f, status: v === "all" ? "" : v }));
                  setPage(1);
                }}
              >
                <SelectTrigger id="status" className="bg-background border-border">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="pending_approval">En aprobación</SelectItem>
                  <SelectItem value="completed">Completado</SelectItem>
                  <SelectItem value="rejected">Rechazado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="amountMin">Monto mínimo (USD)</Label>
              <Input
                id="amountMin"
                type="number"
                min="0"
                step="0.01"
                placeholder="Ej: 0"
                value={filters.amountMin}
                onChange={(e) => {
                  setFilters((f) => ({ ...f, amountMin: e.target.value }));
                  setPage(1);
                }}
                className="bg-background border-border"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="amountMax">Monto máximo (USD)</Label>
              <Input
                id="amountMax"
                type="number"
                min="0"
                step="0.01"
                placeholder="Ej: 1000"
                value={filters.amountMax}
                onChange={(e) => {
                  setFilters((f) => ({ ...f, amountMax: e.target.value }));
                  setPage(1);
                }}
                className="bg-background border-border"
              />
            </div>
          </div>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={handleClearFilters}>
              Limpiar filtros
            </Button>
          )}
        </CardContent>
      </Card>

      <Card className="border-border bg-card shadow-sm mt-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Movimientos</CardTitle>
          <CardDescription>
            {total === 0
              ? "No hay transferencias con los filtros aplicados."
              : `Mostrando ${(page - 1) * PAGE_SIZE + 1}-${Math.min(page * PAGE_SIZE, total)} de ${total}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : transfers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No hay movimientos que mostrar.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="text-left font-medium p-3">Fecha</th>
                      <th className="text-left font-medium p-3">Origen</th>
                      <th className="text-left font-medium p-3">Descripción</th>
                      <th className="text-right font-medium p-3">Monto</th>
                      <th className="text-left font-medium p-3">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transfers.map((t: { id: number; createdAt: unknown; fromUserId?: string | null; description?: string; amount: number; status?: string }) => {
                      const date = toDate(t.createdAt);
                      return (
                        <tr key={t.id} className="border-b border-border/60 hover:bg-muted/30">
                          <td className="p-3 text-foreground">
                            {isValidDate(t.createdAt)
                              ? format(date, "dd MMM yyyy, HH:mm", { locale: es })
                              : "—"}
                          </td>
                          <td className="p-3 text-muted-foreground">
                            {t.fromUserId ? "Admin" : "Sistema"}
                          </td>
                          <td className="p-3 text-muted-foreground max-w-[200px] truncate" title={t.description}>
                            {t.description || "—"}
                          </td>
                          <td className="p-3 text-right font-medium tabular-nums">
                            {new Intl.NumberFormat("es-EC", {
                              style: "currency",
                              currency: "USD",
                              minimumFractionDigits: 2,
                            }).format(t.amount ?? 0)}
                          </td>
                          <td className="p-3">
                            <span
                              className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
                                t.status === "completed"
                                  ? "bg-green-500/15 text-green-700 dark:text-green-400"
                                  : t.status === "rejected"
                                    ? "bg-red-500/15 text-red-700 dark:text-red-400"
                                    : "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                              }`}
                            >
                              {STATUS_LABELS[t.status ?? ""] ?? t.status ?? "—"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between gap-4 mt-4 pt-4 border-t border-border">
                  <p className="text-sm text-muted-foreground">
                    Página {page} de {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Anterior
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages}
                    >
                      Siguiente
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
