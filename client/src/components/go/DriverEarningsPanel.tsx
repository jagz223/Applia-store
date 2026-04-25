import { useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertTriangle, Calendar, TrendingUp, Wallet } from "lucide-react";
import { api } from "@shared/routes";
import { PROVIDER_WALLET_FLOOR_USD } from "@shared/wallet-limits";
import { useWallet } from "@/hooks/use-mango-data";
import { loadTripLog, type CargoDriverTripLog } from "@/lib/cargo-driver-storage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const money = (n: number) =>
  new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(n);

function localDayKey(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function todayLocalKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDayHeading(key: string, todayKey: string): string {
  if (key === todayKey) return "Hoy";
  const [y, m, day] = key.split("-").map((x) => parseInt(x, 10));
  if (!y || !m || !day) return key;
  const d = new Date(y, m - 1, day);
  return new Intl.DateTimeFormat("es-EC", { weekday: "long", day: "numeric", month: "short" }).format(d);
}

function groupTripsByLocalDay(
  trips: CargoDriverTripLog[]
): { key: string; trips: CargoDriverTripLog[]; count: number; totalUsd: number }[] {
  const m = new Map<string, CargoDriverTripLog[]>();
  for (const t of trips) {
    const k = localDayKey(t.endedAt);
    if (!k) continue;
    const list = m.get(k) ?? [];
    list.push(t);
    m.set(k, list);
  }
  for (const list of m.values()) {
    list.sort((a, b) => new Date(b.endedAt).getTime() - new Date(a.endedAt).getTime());
  }
  return [...m.keys()]
    .sort((a, b) => b.localeCompare(a))
    .map((key) => {
      const list = m.get(key) ?? [];
      const totalUsd = list.reduce((a, t) => a + (typeof t.amountUsd === "number" ? t.amountUsd : 0), 0);
      return { key, trips: list, count: list.length, totalUsd };
    });
}

type Props = {
  open: boolean;
};

/**
 * Mini panel de ingresos estilo asociado: cartera, piso de deuda, actividad por día (registro local Car Go).
 */
export function DriverEarningsPanel({ open }: Props) {
  const queryClient = useQueryClient();
  const { data: walletData, isLoading: walletLoading, isFetching } = useWallet({
    enabled: open,
  });

  const trips = useMemo(() => (open ? loadTripLog() : []), [open]);
  const byDay = useMemo(() => groupTripsByLocalDay(trips), [trips]);
  const localTotal = useMemo(
    () => trips.reduce((a, t) => a + (typeof t.amountUsd === "number" ? t.amountUsd : 0), 0),
    [trips]
  );

  const tKey = todayLocalKey();
  const todayRow = byDay.find((d) => d.key === tKey);
  const tripsToday = todayRow?.count ?? 0;
  const amountToday = todayRow?.totalUsd ?? 0;

  const wallet = typeof walletData?.wallet === "number" ? walletData.wallet : 0;
  const totalPlatform = typeof walletData?.totalEarnings === "number" ? walletData.totalEarnings : 0;
  const floorUsd =
    typeof (walletData as { providerWalletFloorUsd?: number })?.providerWalletFloorUsd === "number"
      ? (walletData as { providerWalletFloorUsd: number }).providerWalletFloorUsd
      : PROVIDER_WALLET_FLOOR_USD;
  const debtCapped = !!(walletData as { isProviderDebtCapped?: boolean })?.isProviderDebtCapped;
  const walletLoadingAny = walletLoading || isFetching;

  useEffect(() => {
    if (!open) return;
    void queryClient.invalidateQueries({ queryKey: [api.genfeb.wallet.me.path] });
  }, [open, queryClient]);

  return (
    <div className="space-y-4 pb-2">
      {debtCapped ? (
        <div
          className="flex items-start gap-2 rounded-xl border border-amber-500/50 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-950 dark:text-amber-100"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" aria-hidden />
          <p>
            Llegaste al límite de deuda: solo podrás aceptar viajes con pago en Saldo GenFeb hasta regularizar, o
            recarga en la app.
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <Card className={cn(wallet < 0 && "border-amber-500/35")}>
          <CardHeader className="p-3 pb-1">
            <CardTitle className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <Wallet className="h-3.5 w-3.5 text-primary" aria-hidden />
              Saldo GenFeb
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            {walletLoadingAny ? (
              <div className="h-8 w-24 animate-pulse rounded bg-muted" />
            ) : (
              <p
                className={cn(
                  "text-lg font-bold leading-tight tabular-nums",
                  wallet < 0 && "text-amber-600 dark:text-amber-400"
                )}
              >
                {money(wallet)}
              </p>
            )}
            <p className="text-[10px] text-muted-foreground mt-1">Cartera plataforma</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-3 pb-1">
            <CardTitle className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600" aria-hidden />
              Piso mínimo
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <p className="text-lg font-bold leading-tight tabular-nums text-foreground">{money(floorUsd)}</p>
            <p className="text-[10px] text-muted-foreground mt-1">Efectivo / transfer</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-3 pb-1">
            <CardTitle className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <Calendar className="h-3.5 w-3.5 text-primary" aria-hidden />
              Viajes hoy
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <p className="text-lg font-bold leading-tight tabular-nums">{tripsToday}</p>
            <p className="text-[10px] text-muted-foreground mt-1">En tu resumen</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-3 pb-1">
            <CardTitle className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
              Ingresos hoy
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <p className="text-lg font-bold leading-tight tabular-nums text-foreground">{money(amountToday)}</p>
            <p className="text-[10px] text-muted-foreground mt-1">Resumen del día</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-primary/15 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader className="p-3 pb-1">
          <CardTitle className="text-sm font-semibold">Ingresos en plataforma (total)</CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 space-y-1">
          {walletLoadingAny ? (
            <div className="h-7 w-32 animate-pulse rounded bg-muted" />
          ) : (
            <p className="text-xl font-bold tabular-nums text-foreground">{money(totalPlatform)}</p>
          )}
          <p className="text-xs text-muted-foreground">Acumulado de todos los servicios GenFeb vinculados a tu cuenta.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-3 pb-2">
          <CardTitle className="text-sm">Resumen Car Go (estimado)</CardTitle>
          <p className="text-xs font-normal text-muted-foreground">Suma de viajes en este resumen: {money(localTotal)}</p>
        </CardHeader>
        <CardContent className="p-3 pt-0 space-y-0">
          {byDay.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aún no hay viajes en el detalle. Completa carreras para ver el desglose por día.</p>
          ) : (
            <ul className="space-y-4 max-h-[min(40vh,320px)] overflow-y-auto pr-0.5">
              {byDay.map((day) => (
                <li key={day.key} className="rounded-lg border border-border/80 bg-card/50">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/50 px-3 py-2">
                    <span className="text-sm font-semibold capitalize text-foreground">
                      {formatDayHeading(day.key, tKey)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {day.count} {day.count === 1 ? "viaje" : "viajes"} · {money(day.totalUsd)}
                    </span>
                  </div>
                  <ul className="divide-y divide-border/60">
                    {day.trips.map((t) => (
                      <li
                        key={t.id}
                        className="grid grid-cols-[1fr_auto] items-start gap-x-2 gap-y-0.5 px-3 py-2 text-xs"
                      >
                        <div>
                          <span className="text-foreground font-medium">
                            {(() => {
                              try {
                                return new Intl.DateTimeFormat("es-EC", { timeStyle: "short" }).format(
                                  new Date(t.endedAt)
                                );
                              } catch {
                                return "—";
                              }
                            })()}
                          </span>
                          <span className="text-muted-foreground">
                            {" "}
                            · {t.durationMin} min · {t.payment === "genfeb" ? "GenFeb" : "Efectivo"}
                          </span>
                        </div>
                        <span className="shrink-0 font-semibold tabular-nums text-foreground">
                          {money(t.amountUsd)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Button variant="secondary" className="w-full" asChild>
        <Link href="/recharge" onClick={() => queryClient.invalidateQueries({ queryKey: [api.genfeb.wallet.me.path] })}>
          Recargar saldo
        </Link>
      </Button>
    </div>
  );
}
