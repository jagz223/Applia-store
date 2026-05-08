import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertTriangle, Calendar, HandCoins, TrendingUp, Wallet } from "lucide-react";
import { api } from "@shared/routes";
import { MOBILITY_HISTORY_SUBTITLE } from "@shared/mobility-ui-labels";
import { PROVIDER_WALLET_FLOOR_USD } from "@shared/wallet-limits";
import { useAuth } from "@/hooks/use-auth";
import { FEATURE_OFF_PLATFORM_COMMISSION_ENABLED, FEATURE_WALLET_RECHARGE_UI_ENABLED } from "@shared/feature-flags";
import { useWallet, useWithdraw } from "@/hooks/use-mango-data";
import { loadTripLog, type CargoDriverTripLog } from "@/lib/cargo-driver-storage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

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
  configHref?: string;
};

/**
 * Mini panel de ingresos estilo asociado: cartera, piso de deuda, actividad por día (registro local Car Go).
 */
export function DriverEarningsPanel({ open, configHref }: Props) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const { data: walletData, isLoading: walletLoading, isFetching } = useWallet({
    enabled: open && FEATURE_WALLET_RECHARGE_UI_ENABLED,
  });
  const withdraw = useWithdraw();
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");

  const tripsForPanel = useMemo(() => {
    // Preferir email para evitar colisiones si el backend cambia el tipo de id.
    const accountKey =
      (user as any)?.email != null ? String((user as any).email) : (user as any)?.id != null ? String((user as any).id) : null;
    const all = open ? loadTripLog(accountKey) : [];
    if (FEATURE_WALLET_RECHARGE_UI_ENABLED) return all;
    return all.filter((t) => t.payment === "cash" || t.payment === "bank_transfer");
  }, [open, user?.id, (user as any)?.email]);
  const byDay = useMemo(() => groupTripsByLocalDay(tripsForPanel), [tripsForPanel]);
  const localTotal = useMemo(
    () => tripsForPanel.reduce((a, t) => a + (typeof t.amountUsd === "number" ? t.amountUsd : 0), 0),
    [tripsForPanel]
  );

  const tKey = todayLocalKey();
  const todayRow = byDay.find((d) => d.key === tKey);
  const tripsToday = todayRow?.count ?? 0;
  const amountToday = todayRow?.totalUsd ?? 0;

  const wallet = typeof walletData?.wallet === "number" ? walletData.wallet : 0;
  const totalPlatform = typeof walletData?.totalEarnings === "number" ? walletData.totalEarnings : 0;
  const withdrawingFunds = typeof (walletData as { withdrawingFunds?: number })?.withdrawingFunds === "number" ? (walletData as any).withdrawingFunds : 0;
  const floorUsd =
    typeof (walletData as { providerWalletFloorUsd?: number })?.providerWalletFloorUsd === "number"
      ? (walletData as { providerWalletFloorUsd: number }).providerWalletFloorUsd
      : PROVIDER_WALLET_FLOOR_USD;
  const debtCapped = !!(walletData as { isProviderDebtCapped?: boolean })?.isProviderDebtCapped;
  const walletLoadingAny = walletLoading || isFetching;

  const bankName = String((user as any)?.bankName ?? "").trim();
  const accountNumber = String((user as any)?.accountNumber ?? "").trim();
  const hasBankData = !!bankName && !!accountNumber;

  useEffect(() => {
    if (!open || !FEATURE_WALLET_RECHARGE_UI_ENABLED) return;
    void queryClient.invalidateQueries({ queryKey: [api.genfeb.wallet.me.path] });
  }, [open, queryClient]);

  const requestWithdraw = async () => {
    const n = Number(withdrawAmount);
    if (!Number.isFinite(n) || n <= 0) {
      toast({ title: "Monto inválido", description: "Ingresa un monto mayor a 0.", variant: "destructive" });
      return;
    }
    try {
      await withdraw.mutateAsync(n);
      setWithdrawOpen(false);
      setWithdrawAmount("");
      toast({ title: "Solicitud enviada", description: "Tu retiro quedó en proceso para aprobación." });
    } catch (e) {
      toast({ title: "No se pudo solicitar retiro", description: e instanceof Error ? e.message : "Intenta de nuevo.", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4 pb-2">
      {FEATURE_WALLET_RECHARGE_UI_ENABLED && FEATURE_OFF_PLATFORM_COMMISSION_ENABLED && debtCapped ? (
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

      {!FEATURE_WALLET_RECHARGE_UI_ENABLED ? (
        <Card className="border-emerald-600/30 bg-gradient-to-br from-emerald-500/10 to-transparent">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-sm font-semibold">Ganancias en efectivo y transferencias</CardTitle>
            <p className="text-xs font-normal text-muted-foreground">
              Total según viajes terminados en este dispositivo ({MOBILITY_HISTORY_SUBTITLE}). Se actualiza al completar cada
              servicio.
            </p>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <p className="text-2xl font-bold tabular-nums text-foreground">{money(localTotal)}</p>
            <p className="text-[11px] text-muted-foreground mt-1">
              {tripsForPanel.length === 0
                ? "Aún no hay viajes con estos medios de pago en el registro local."
                : `${tripsForPanel.length} ${tripsForPanel.length === 1 ? "servicio" : "servicios"} sumados.`}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        {FEATURE_WALLET_RECHARGE_UI_ENABLED && (
          <>
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
          </>
        )}

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

      {FEATURE_WALLET_RECHARGE_UI_ENABLED && (
        <>
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
              <CardTitle className="flex items-center gap-2 text-base">
                <HandCoins className="h-5 w-5 text-primary" aria-hidden />
                Retiros
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 space-y-2 text-sm">
              <p className="text-xs text-muted-foreground">
                Retira tu Saldo GenFeb a tu cuenta bancaria. El retiro queda pendiente hasta aprobación.
              </p>
              {!hasBankData ? (
                <Button asChild className="w-full">
                  <Link href={configHref ?? "/settings"}>Configurar cuenta bancaria</Link>
                </Button>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    Banco: <span className="font-medium text-foreground">{bankName}</span> · Cuenta:{" "}
                    <span className="font-mono font-medium text-foreground">{accountNumber}</span>
                  </p>
                  <Button
                    type="button"
                    className="w-full"
                    onClick={() => setWithdrawOpen(true)}
                    disabled={withdraw.isPending || withdrawingFunds > 0}
                  >
                    {withdrawingFunds > 0 ? "Retiro en proceso" : "Solicitar retiro"}
                  </Button>
                  {withdrawingFunds > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Ya tienes un retiro pendiente por <span className="font-semibold text-foreground">{money(withdrawingFunds)}</span>.
                    </p>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Oculto por solicitud: el resumen era local (no oficial). */}

      {FEATURE_WALLET_RECHARGE_UI_ENABLED && (
        <>
          <Button variant="secondary" className="w-full" asChild>
            <Link href="/recharge" onClick={() => queryClient.invalidateQueries({ queryKey: [api.genfeb.wallet.me.path] })}>
              Recargar saldo
            </Link>
          </Button>

          <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Solicitar retiro</DialogTitle>
            <DialogDescription>Ingresa el monto a retirar. Se enviará a tu cuenta bancaria registrada.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Disponible: <span className="font-semibold text-foreground tabular-nums">{money(wallet)}</span>
            </p>
            <Input
              inputMode="decimal"
              placeholder="Monto (USD)"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={() => setWithdrawOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => void requestWithdraw()} disabled={withdraw.isPending}>
              {withdraw.isPending ? "Enviando…" : "Enviar solicitud"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
        </>
      )}
    </div>
  );
}
