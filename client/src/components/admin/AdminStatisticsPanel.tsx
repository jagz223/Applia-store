import { useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { BarChart3, CalendarRange, Loader2, Users, Briefcase, ClipboardList, Wallet, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  useAdminDashboardStats,
  type AdminDashboardPeriod,
  type AdminDashboardStatsResponse,
} from "@/hooks/use-mango-data";

const PERIOD_OPTIONS: { value: AdminDashboardPeriod; label: string; short: string }[] = [
  { value: "day", label: "Hoy", short: "Día" },
  { value: "week", label: "Esta semana", short: "Sem." },
  { value: "month", label: "Este mes", short: "Mes" },
  { value: "year", label: "Este año", short: "Año" },
];

function formatUsd(n: number) {
  return new Intl.NumberFormat("es-EC", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function StatBar({ label, value, max, classNameBar }: { label: string; value: number; max: number; classNameBar?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="min-w-0 space-y-1">
      <div className="flex justify-between gap-2 text-[11px] sm:text-xs md:text-sm text-muted-foreground">
        <span className="min-w-0 truncate">{label}</span>
        <span className="shrink-0 tabular-nums font-medium text-foreground">{value}</span>
      </div>
      <div className="h-2 w-full min-w-0 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full max-w-full rounded-full transition-all ${classNameBar ?? "bg-mango-orange"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function numMax(...vals: number[]) {
  return Math.max(1, ...vals.filter((v) => v >= 0));
}

function SnapshotSection({ s }: { s: AdminDashboardStatsResponse["snapshot"] }) {
  const b = s.bookingsByStatus;
  const bookingTotal = Math.max(1, b.pending + b.confirmed + b.in_progress + b.completed + b.cancelled);

  return (
    <div className="grid grid-cols-1 gap-4 min-[400px]:grid-cols-2 xl:grid-cols-3">
      <Card className="min-w-0 border-border/80 shadow-sm">
        <CardHeader className="pb-2 space-y-1">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-mango-orange shrink-0" />
            Usuarios
          </CardTitle>
          <CardDescription className="text-xs">Totales en la plataforma</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg bg-muted/40 px-2.5 py-2 min-w-0">
              <p className="text-[11px] text-muted-foreground truncate">Asociados</p>
              <p className="text-xl font-semibold tabular-nums">{s.users.professionals}</p>
            </div>
            <div className="rounded-lg bg-muted/40 px-2.5 py-2 min-w-0">
              <p className="text-[11px] text-muted-foreground truncate">Clientes</p>
              <p className="text-xl font-semibold tabular-nums">{s.users.clients}</p>
            </div>
          </div>
          <StatBar label="Asociados" value={s.users.professionals} max={numMax(s.users.professionals, s.users.clients)} />
          <StatBar
            label="Clientes"
            value={s.users.clients}
            max={numMax(s.users.professionals, s.users.clients)}
            classNameBar="bg-sky-600/80"
          />
        </CardContent>
      </Card>

      <Card className="min-w-0 border-border/80 shadow-sm">
        <CardHeader className="pb-2 space-y-1">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-mango-orange shrink-0" />
            Reservas
          </CardTitle>
          <CardDescription className="text-xs">Por estado actual</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2.5 pt-0">
          <StatBar label="Pendiente" value={b.pending} max={bookingTotal} />
          <StatBar label="Confirmada" value={b.confirmed} max={bookingTotal} classNameBar="bg-violet-500/85" />
          <StatBar label="En curso" value={b.in_progress} max={bookingTotal} classNameBar="bg-amber-500/90" />
          <StatBar label="Completada" value={b.completed} max={bookingTotal} classNameBar="bg-emerald-600/85" />
          <StatBar label="Cancelada" value={b.cancelled} max={bookingTotal} classNameBar="bg-red-400/80" />
        </CardContent>
      </Card>

      <Card className="min-w-0 border-border/80 shadow-sm min-[400px]:col-span-2 xl:col-span-1">
        <CardHeader className="pb-2 space-y-1">
          <CardTitle className="text-base flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-mango-orange shrink-0" />
            Servicios y colas
          </CardTitle>
          <CardDescription className="text-xs">Catálogo y tareas pendientes</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
            <div className="rounded-lg bg-muted/40 px-2.5 py-2">
              <p className="text-[11px] text-muted-foreground">Serv. activos</p>
              <p className="text-lg font-semibold tabular-nums">{s.services.active}</p>
            </div>
            <div className="rounded-lg bg-muted/40 px-2.5 py-2">
              <p className="text-[11px] text-muted-foreground">Inactivos</p>
              <p className="text-lg font-semibold tabular-nums">{s.services.inactive}</p>
            </div>
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/25 px-2.5 py-2 col-span-2 sm:col-span-1">
              <p className="text-[11px] text-amber-800 dark:text-amber-200/90">Por aprobar (asoc.)</p>
              <p className="text-lg font-semibold tabular-nums text-amber-900 dark:text-amber-100">
                {s.pendingVerificationAssociates}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-2 text-xs sm:text-sm">
            <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2.5 py-2 min-w-0">
              <span className="text-muted-foreground truncate">Recargas en espera</span>
              <span className="font-semibold tabular-nums shrink-0">{s.pendingRechargeRequests}</span>
            </div>
            <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2.5 py-2 min-w-0">
              <span className="text-muted-foreground truncate">Retiros pendientes</span>
              <span className="font-semibold tabular-nums shrink-0">{s.pendingWithdrawalRequests}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PeriodSection({ p, range }: { p: AdminDashboardStatsResponse["period"]; range: { from: string; to: string } }) {
  const bc = p.bookingsCreatedByStatus;
  const bookingCreatedMax = numMax(
    bc.pending,
    bc.confirmed,
    bc.in_progress,
    bc.completed,
    bc.cancelled,
    p.bookingsCreatedTotal
  );

  const movementMax = numMax(
    p.newUsersTotal,
    p.bookingsCreatedTotal,
    p.userRechargesCompleted.count,
    p.adminBalanceCredits.count
  );

  const fromLabel = format(new Date(range.from), "d MMM", { locale: es });
  const toLabel = format(new Date(range.to), "d MMM yyyy", { locale: es });

  return (
    <Card className="border-border/80 shadow-sm min-w-0">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-mango-orange shrink-0" />
          Actividad en el período
        </CardTitle>
        <CardDescription className="text-xs break-words">
          {fromLabel} — {toLabel}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 pt-0">
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Resumen numérico</p>
          <div className="grid grid-cols-2 min-[360px]:grid-cols-3 sm:grid-cols-4 gap-2">
            <div className="rounded-lg border bg-card px-2 py-2.5 min-w-0">
              <p className="text-[10px] sm:text-xs text-muted-foreground leading-tight">Nuevos registros</p>
              <p className="text-lg sm:text-xl font-semibold tabular-nums">{p.newUsersTotal}</p>
              <p className="text-[10px] text-muted-foreground truncate">
                {p.newProfessionals} asoc. · {p.newClients} cli.
              </p>
            </div>
            <div className="rounded-lg border bg-card px-2 py-2.5 min-w-0">
              <p className="text-[10px] sm:text-xs text-muted-foreground leading-tight">Reservas nuevas</p>
              <p className="text-lg sm:text-xl font-semibold tabular-nums">{p.bookingsCreatedTotal}</p>
            </div>
            <div className="rounded-lg border bg-card px-2 py-2.5 min-w-0">
              <p className="text-[10px] sm:text-xs text-muted-foreground leading-tight">Recargas aprobadas</p>
              <p className="text-lg sm:text-xl font-semibold tabular-nums">{p.userRechargesCompleted.count}</p>
              <p className="text-[10px] text-muted-foreground truncate">{formatUsd(p.userRechargesCompleted.totalUsd)}</p>
            </div>
            <div className="rounded-lg border bg-card px-2 py-2.5 min-w-0 col-span-2 min-[360px]:col-span-1 sm:col-span-1">
              <p className="text-[10px] sm:text-xs text-muted-foreground leading-tight">Gestión saldo (admin)</p>
              <p className="text-lg sm:text-xl font-semibold tabular-nums">{p.adminBalanceCredits.count}</p>
              <p className="text-[10px] text-muted-foreground truncate">{formatUsd(p.adminBalanceCredits.totalUsd)}</p>
            </div>
            <div className="rounded-lg border bg-card px-2 py-2.5 min-w-0">
              <p className="text-[10px] sm:text-xs text-muted-foreground leading-tight">Recargas rechazadas</p>
              <p className="text-lg sm:text-xl font-semibold tabular-nums">{p.userRechargesRejected}</p>
            </div>
            <div className="rounded-lg border bg-card px-2 py-2.5 min-w-0">
              <p className="text-[10px] sm:text-xs text-muted-foreground leading-tight">Solic. recarga (nuevas)</p>
              <p className="text-lg sm:text-xl font-semibold tabular-nums">{p.userRechargesPendingCreated}</p>
            </div>
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Comparativo (barras)</p>
          <div className="space-y-2.5 rounded-lg border border-border/60 bg-muted/20 p-3">
            <StatBar label="Usuarios nuevos" value={p.newUsersTotal} max={movementMax} />
            <StatBar label="Reservas creadas" value={p.bookingsCreatedTotal} max={movementMax} classNameBar="bg-violet-500/85" />
            <StatBar
              label="Recargas aprobadas (cant.)"
              value={p.userRechargesCompleted.count}
              max={movementMax}
              classNameBar="bg-emerald-600/85"
            />
            <StatBar
              label="Créditos admin (cant.)"
              value={p.adminBalanceCredits.count}
              max={movementMax}
              classNameBar="bg-sky-600/80"
            />
          </div>
        </div>

        {p.bookingsCreatedTotal > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Reservas nuevas por estado actual</p>
            <div className="space-y-2.5 rounded-lg border border-border/60 bg-muted/20 p-3">
              <StatBar label="Pendiente" value={bc.pending} max={bookingCreatedMax} />
              <StatBar label="Confirmada" value={bc.confirmed} max={bookingCreatedMax} classNameBar="bg-violet-500/85" />
              <StatBar label="En curso" value={bc.in_progress} max={bookingCreatedMax} classNameBar="bg-amber-500/90" />
              <StatBar label="Completada" value={bc.completed} max={bookingCreatedMax} classNameBar="bg-emerald-600/85" />
              <StatBar label="Cancelada" value={bc.cancelled} max={bookingCreatedMax} classNameBar="bg-red-400/80" />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function AdminStatisticsPanel({ enabled }: { enabled: boolean }) {
  const [period, setPeriod] = useState<AdminDashboardPeriod>("week");
  const { data, isLoading, isError, error } = useAdminDashboardStats(period, { enabled });

  return (
    <div className="space-y-4 min-w-0">
      <Card className="border-border/80 shadow-sm overflow-hidden">
        <CardHeader className="pb-3 space-y-3">
          <div className="flex flex-col gap-3 min-[380px]:flex-row min-[380px]:items-start min-[380px]:justify-between">
            <div className="min-w-0 space-y-1">
              <CardTitle className="text-lg sm:text-xl flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-mango-orange shrink-0" />
                Estadísticas
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Números y barras del negocio. Filtra por periodo para ver registros y movimientos.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-1.5 shrink-0 w-full min-[380px]:w-auto min-[380px]:justify-end">
              {PERIOD_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  type="button"
                  variant={period === opt.value ? "default" : "outline"}
                  size="sm"
                  className="h-8 px-2.5 sm:px-3 text-xs sm:text-sm flex-1 min-[380px]:flex-none min-w-[4.25rem]"
                  onClick={() => setPeriod(opt.value)}
                >
                  <span className="sm:hidden">{opt.short}</span>
                  <span className="hidden sm:inline">{opt.label}</span>
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
      </Card>

      {isLoading && (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm">Cargando estadísticas…</p>
        </div>
      )}

      {isError && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="pt-6 flex items-start gap-2 text-sm">
            <ShieldAlert className="h-4 w-4 shrink-0 text-destructive mt-0.5" />
            <p>{error instanceof Error ? error.message : "No se pudieron cargar las estadísticas."}</p>
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && data && (
        <>
          <SnapshotSection s={data.snapshot} />
          <PeriodSection p={data.period} range={data.range} />
          <p className="text-[11px] sm:text-xs text-muted-foreground flex items-center gap-1.5 px-0.5">
            <Wallet className="h-3.5 w-3.5 shrink-0 opacity-70" />
            Las recargas aprobadas son solicitudes de usuario aceptadas; la gestión de saldo son abonos directos desde el panel.
          </p>
        </>
      )}
    </div>
  );
}
