import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { AlertTriangle, CalendarClock, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentProvider } from "@/hooks/use-mango-data";
import { useProviderSubscriptionMonthlyUsd } from "@/hooks/use-provider-subscription-monthly-usd";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  LISTING_SUBSCRIPTION_WARNING_DAYS,
  listingSubscriptionDaysRemaining,
} from "@shared/professional-listing-subscription";
import {
  criticalListingBannerCopy,
  expiredListingBannerCopy,
  urgentListingBannerHeadline,
  urgentListingDefaultDetail,
  urgentListingDefaultDetailShort,
  urgentListingDriverDetail,
  urgentListingDriverDetailShort,
} from "@/components/listing-subscription-ribbon-copy";
import { prepareRenewalPaymentNavigation, VERIFY_PAYMENT_PATH } from "@/lib/verify-return-path";

const ribbonPad = "px-2.5 py-1.5 sm:px-4 sm:py-2.5";
const ribbonText = "text-xs font-semibold leading-snug sm:text-sm";

const RENEW_PAYMENT_HREF = VERIFY_PAYMENT_PATH;

function safeUserIdForPrefs(userId: unknown): string {
  const s = String(userId ?? "").trim();
  return s.length > 0 ? s : "anon";
}

type ProviderMe = {
  isVerified?: boolean;
  isListingPublished?: boolean;
  visibilitySubscriptionEndsAt?: string | null;
  /** Viene del backend enriquecido; si falta, calculamos en cliente. */
  subscriptionDaysRemaining?: number | null;
};

/**
 * Franja / modal para la cuota mensual de visibilidad: contador, aviso ~10 días, vencido = CTA renovar.
 */
export function ListingSubscriptionRibbon() {
  const { isAuthenticated, user } = useAuth();
  const { data: provider } = useCurrentProvider();
  const { monthlyUsdLabel } = useProviderSubscriptionMonthlyUsd({ enabled: isAuthenticated });
  const { toast } = useToast();
  const [reminderOpen, setReminderOpen] = useState(false);
  const [actionModalOpen, setActionModalOpen] = useState(false);
  const [softHidden, setSoftHidden] = useState(false);

  const prefsKey = useMemo(() => {
    const uid = safeUserIdForPrefs((user as any)?.id);
    return `listing_subs_ribbon_hidden_v1:${uid}`;
  }, [user]);

  const context = useMemo(() => {
    if (typeof window === "undefined") return { isDriver: false };
    const p = window.location.pathname || "";
    const isDriver =
      p.startsWith("/go/driver") ||
      p.startsWith("/go/taxi/driver") ||
      p.startsWith("/go/delivery/driver") ||
      p.startsWith("/go/pack/driver") ||
      p.startsWith("/go/cargo/driver");
    return { isDriver };
  }, []);
  const remindedKey = useMemo(() => {
    const p = provider as ProviderMe | null | undefined;
    if (!p?.visibilitySubscriptionEndsAt) return null;
    return `listing_renew_dlg_${p.visibilitySubscriptionEndsAt}`;
  }, [provider]);

  const state = useMemo(() => {
    if (!isAuthenticated) return null;
    const p = provider as ProviderMe | null | undefined;
    if (!p?.isVerified) return null;
    const endsAt = p.visibilitySubscriptionEndsAt;
    if (!endsAt) return null;

    const days = p.subscriptionDaysRemaining ?? listingSubscriptionDaysRemaining(endsAt) ?? null;
    if (days == null) return null;
    const expired = p.isListingPublished === false;
    const critical = !expired && days > 0 && days <= 2;
    const urgent = !expired && !critical && days > 0 && days <= LISTING_SUBSCRIPTION_WARNING_DAYS;
    const endDate = new Date(endsAt);
    const endLabel = Number.isNaN(endDate.getTime())
      ? endsAt
      : endDate.toLocaleString("es-EC", { dateStyle: "medium", timeStyle: "short" });

    return { days, expired, critical, urgent, endsAt, endLabel };
  }, [isAuthenticated, provider]);

  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    try {
      const v = localStorage.getItem(prefsKey);
      if (v === "1") setSoftHidden(true);
    } catch {
      /* ignore */
    }
  }, [prefsKey]);

  useEffect(() => {
    if (!state?.urgent || remindedKey == null) return;
    if (typeof sessionStorage === "undefined") return;
    try {
      if (sessionStorage.getItem(remindedKey)) return;
      sessionStorage.setItem(remindedKey, "1");
      setReminderOpen(true);
      toast({
        title: "Renovación de visibilidad",
        description: `Te quedan ${state.days} día(s). Renueva la cuota mensual (${monthlyUsdLabel}) para seguir publicado.`,
        duration: 10_000,
      });
    } catch {
      /* ignore */
    }
  }, [state?.urgent, state?.days, remindedKey, toast, monthlyUsdLabel]);

  useEffect(() => {
    if (!state || remindedKey == null) return;
    if (!(state.critical || state.expired)) return;
    if (typeof sessionStorage === "undefined") return;
    const key = `listing_action_dlg_${state.endsAt}_${state.expired ? "expired" : "critical"}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
      setActionModalOpen(true);
    } catch {
      /* ignore */
    }
  }, [state, remindedKey]);

  const dismissReminder = useCallback(() => setReminderOpen(false), []);
  const dismissActionModal = useCallback(() => setActionModalOpen(false), []);
  const dismissSoft = useCallback(() => {
    setSoftHidden(true);
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(prefsKey, "1");
    } catch {
      /* ignore */
    }
  }, [prefsKey]);

  if (!state) return null;
  // En vencido/crítico SIEMPRE mostrar (cumplimiento operativo).
  if (softHidden && !(state.expired || state.critical)) return null;

  if (state.expired || state.critical) {
    const expiredCopy = expiredListingBannerCopy(monthlyUsdLabel);
    const criticalCopy = criticalListingBannerCopy(state.days, state.endLabel, monthlyUsdLabel);
    return (
      <>
        {state.expired ? (
          <div className={`border-b border-destructive/35 bg-destructive/15 ${ribbonPad}`}>
            <div className="mx-auto flex max-w-5xl flex-col items-stretch justify-center gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <div className={`flex min-w-0 items-start gap-2 text-destructive sm:items-center ${ribbonText}`}>
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 sm:mt-0 sm:h-4 sm:w-4" aria-hidden />
                <span className="min-w-0 text-left">
                  <span className="md:hidden">{expiredCopy.short}</span>
                  <span className="hidden md:inline">{expiredCopy.long}</span>
                </span>
              </div>
              <Button
                size="sm"
                variant="destructive"
                asChild
                className="h-8 shrink-0 touch-manipulation self-stretch text-xs sm:h-9 sm:self-center sm:text-sm"
              >
                <Link href={RENEW_PAYMENT_HREF} onClick={prepareRenewalPaymentNavigation}>
                  Renovar pago
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className={`border-b border-amber-500/45 bg-amber-500/18 ${ribbonPad}`}>
            <div className="mx-auto flex max-w-5xl flex-col items-stretch justify-center gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <div className={`flex min-w-0 items-start gap-2 text-foreground sm:items-center ${ribbonText}`}>
                <CalendarClock
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-300 sm:mt-0 sm:h-4 sm:w-4"
                  aria-hidden
                />
                <span className="min-w-0 text-left">
                  <span className="md:hidden">{criticalCopy.short}</span>
                  <span className="hidden md:inline">{criticalCopy.long}</span>
                </span>
              </div>
              <Button
                size="sm"
                variant="secondary"
                asChild
                className="h-8 shrink-0 touch-manipulation self-stretch border border-amber-600/35 text-xs sm:h-9 sm:self-center sm:text-sm"
              >
                <Link href={RENEW_PAYMENT_HREF} onClick={prepareRenewalPaymentNavigation}>
                  Renovar ahora
                </Link>
              </Button>
            </div>
          </div>
        )}

        <AlertDialog open={actionModalOpen} onOpenChange={setActionModalOpen}>
          <AlertDialogContent overlayClassName="bg-black/75 backdrop-blur-sm">
            <AlertDialogHeader>
              <AlertDialogTitle>
                {state.expired ? "Visibilidad vencida" : "Renueva hoy para no perder visibilidad"}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-left leading-relaxed">
                {state.expired ? (
                  <>
                    Tu publicación en el catálogo está <strong>inactiva</strong> porque venció la cuota mensual (
                    {monthlyUsdLabel}).
                    Envía el comprobante y, al validarlo, volverás a estar visible.
                  </>
                ) : (
                  <>
                    Quedan <strong>{state.days}</strong> día(s) para que expire tu visibilidad (hasta {state.endLabel}).
                    Envía el comprobante de {monthlyUsdLabel} para que el equipo lo valide.
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={dismissActionModal}>Ahora no</AlertDialogCancel>
              <AlertDialogAction asChild>
                <Link
                  href={RENEW_PAYMENT_HREF}
                  onClick={() => {
                    prepareRenewalPaymentNavigation();
                    dismissActionModal();
                  }}
                >
                  Ir a renovar
                </Link>
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  if (state.urgent) {
    const urgentHeadline = urgentListingBannerHeadline(state.days, state.endLabel);
    const detailLong = context.isDriver ? urgentListingDriverDetail : urgentListingDefaultDetail;
    const detailShort = context.isDriver
      ? urgentListingDriverDetailShort(monthlyUsdLabel)
      : urgentListingDefaultDetailShort(monthlyUsdLabel);
    return (
      <>
        <div className={`border-b border-amber-500/40 bg-amber-500/14 ${ribbonPad}`}>
          <div className="mx-auto flex max-w-5xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <div className="flex min-w-0 flex-1 items-start gap-2 sm:gap-3">
              <CalendarClock
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-300 sm:h-5 sm:w-5"
                aria-hidden
              />
              <div className="min-w-0 flex-1 text-left">
                <p className={`${ribbonText} text-foreground`}>{urgentHeadline}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground sm:mt-1 sm:text-xs md:text-sm">
                  <span className="md:hidden">{detailShort}</span>
                  <span className="hidden md:inline">{detailLong}</span>
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center justify-end gap-1.5 sm:gap-2">
              <Button
                size="sm"
                variant="secondary"
                className="h-8 touch-manipulation border border-amber-600/35 px-2.5 text-xs sm:h-9 sm:px-3 sm:text-sm"
                asChild
              >
                <Link href={RENEW_PAYMENT_HREF} onClick={prepareRenewalPaymentNavigation}>
                  Ir a renovar
                </Link>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 shrink-0 touch-manipulation p-0 text-muted-foreground hover:text-foreground sm:h-9 sm:w-9"
                onClick={dismissSoft}
                title="Ocultar este aviso"
              >
                <X className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </div>
        </div>

        <AlertDialog open={reminderOpen} onOpenChange={setReminderOpen}>
          <AlertDialogContent overlayClassName="bg-black/75 backdrop-blur-sm">
            <AlertDialogHeader>
              <AlertDialogTitle>Renovación mensual · {monthlyUsdLabel}</AlertDialogTitle>
              <AlertDialogDescription className="text-left leading-relaxed">
                Quedan <strong>{state.days}</strong> día(s) para que expire tu visibilidad en el catálogo. Envía el comprobante
                de renovación desde la pantalla de pago; cuando un administrador lo valide, se extenderá un mes desde tu
                vencimiento actual (si renuevas antes, no pierdes tiempo ya pagado).
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={dismissReminder}>Entendido</AlertDialogCancel>
              <AlertDialogAction asChild>
                <Link
                  href={RENEW_PAYMENT_HREF}
                  onClick={() => {
                    prepareRenewalPaymentNavigation();
                    dismissReminder();
                  }}
                >
                  Ir a pantalla de pago
                </Link>
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  return (
    <div className="border-b border-border/60 bg-muted/35 px-2.5 py-1.5 text-center text-[11px] text-muted-foreground sm:px-4 sm:py-2 sm:text-xs md:text-sm">
      <span className="inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
        <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          {context.isDriver ? (
            <>
              Habilitación para trabajar como driver activa hasta{" "}
              <strong className="text-foreground">{state.endLabel}</strong>
            </>
          ) : (
            <>
              Visibilidad en catálogo activa hasta{" "}
              <strong className="text-foreground">{state.endLabel}</strong>
            </>
          )}
          {state.days > LISTING_SUBSCRIPTION_WARNING_DAYS ? (
            <>
              {" "}
              ({state.days} días restantes)
            </>
          ) : null}
        </span>
        <Link
          href={RENEW_PAYMENT_HREF}
          onClick={prepareRenewalPaymentNavigation}
          className="text-primary underline-offset-4 hover:underline font-medium whitespace-nowrap"
        >
          Renovar anticipado
        </Link>
        <button
          type="button"
          onClick={dismissSoft}
          className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
          title="Ocultar este aviso"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
          <span className="text-[11px] sm:text-xs">Ocultar</span>
        </button>
      </span>
    </div>
  );
}
