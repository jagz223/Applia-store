import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { AlertTriangle, CalendarClock, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentProvider } from "@/hooks/use-mango-data";
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

const RENEW_PAYMENT_HREF = "/professional/verify/payment";

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
 * Franja / modal para la cuota mensual USD 15: contador, aviso ~10 días, vencido = CTA renovar.
 */
export function ListingSubscriptionRibbon() {
  const { isAuthenticated, user } = useAuth();
  const { data: provider } = useCurrentProvider();
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
        description: `Te quedan ${state.days} día(s). Renová la cuota mensual (USD 15) para seguir publicado.`,
        duration: 10_000,
      });
    } catch {
      /* ignore */
    }
  }, [state?.urgent, state?.days, remindedKey, toast]);

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
    return (
      <>
        {state.expired ? (
          <div className="border-b border-destructive/35 bg-destructive/15 px-3 py-2.5 sm:px-4">
            <div className="mx-auto flex max-w-5xl flex-col items-center justify-center gap-3 sm:flex-row sm:justify-between">
              <div className="flex items-start gap-2 text-center text-sm font-semibold text-destructive sm:text-left">
                <AlertTriangle className="mx-auto mt-0.5 h-4 w-4 shrink-0 sm:mx-0" aria-hidden />
                <span>
                  Tu servicio ya no aparece en el explorador público: venció la cuota mensual de visibilidad (USD 15).
                  Subí el comprobante para que un administrador la valide y recuperes la publicación.
                </span>
              </div>
              <Button size="sm" variant="destructive" asChild className="shrink-0">
                <Link href={RENEW_PAYMENT_HREF}>Renovar pago</Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="border-b border-amber-500/45 bg-amber-500/18 px-3 py-2.5 sm:px-4">
            <div className="mx-auto flex max-w-5xl flex-col items-center justify-center gap-3 sm:flex-row sm:justify-between">
              <div className="flex items-start gap-2 text-center text-sm font-semibold text-foreground sm:text-left">
                <CalendarClock className="mx-auto mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300 sm:mx-0" aria-hidden />
                <span>
                  Quedan <strong>{state.days}</strong> día(s) para que expire tu visibilidad (hasta {state.endLabel}).
                  Renová ahora para evitar quedar fuera del catálogo.
                </span>
              </div>
              <Button size="sm" variant="secondary" asChild className="shrink-0 border border-amber-600/35">
                <Link href={RENEW_PAYMENT_HREF}>Renovar ahora</Link>
              </Button>
            </div>
          </div>
        )}

        <AlertDialog open={actionModalOpen} onOpenChange={setActionModalOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {state.expired ? "Visibilidad vencida" : "Renová hoy para no perder visibilidad"}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-left leading-relaxed">
                {state.expired ? (
                  <>
                    Tu publicación en el catálogo está <strong>inactiva</strong> porque venció la cuota mensual (USD 15).
                    Subí el comprobante y, al validarlo, volverás a estar visible.
                  </>
                ) : (
                  <>
                    Quedan <strong>{state.days}</strong> día(s) para que expire tu visibilidad (hasta {state.endLabel}).
                    Subí el comprobante de USD 15 para que el equipo lo valide.
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={dismissActionModal}>Ahora no</AlertDialogCancel>
              <AlertDialogAction asChild>
                <Link href={RENEW_PAYMENT_HREF} onClick={() => dismissActionModal()}>
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
    return (
      <>
        <div className="border-b border-amber-500/40 bg-amber-500/14 px-3 py-2.5 sm:px-4">
          <div className="mx-auto flex max-w-5xl flex-col items-center justify-center gap-3 sm:flex-row sm:justify-between">
            <div className="flex flex-col items-center gap-1 text-center sm:flex-row sm:items-start sm:gap-3 sm:text-left">
              <CalendarClock className="h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden />
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Te quedan {state.days} día(s) de publicación (hasta {state.endLabel}).
                </p>
                <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
                  {context.isDriver
                    ? "Para poder trabajar como driver sin interrupciones, mantén tu suscripción al día. El costo se renueva cada mes y se valida por el equipo."
                    : "Mantén tu servicio visible en el catálogo con la suscripción mensual. Si renovás antes de que venza, al validarlo se suma un mes desde tu vencimiento actual."}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" className="shrink-0 border border-amber-600/35" asChild>
                <Link href={RENEW_PAYMENT_HREF}>Ir a renovar</Link>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="shrink-0 text-muted-foreground hover:text-foreground"
                onClick={dismissSoft}
                title="Ocultar este aviso"
              >
                <X className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </div>
        </div>

        <AlertDialog open={reminderOpen} onOpenChange={setReminderOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Renovación mensual · USD 15</AlertDialogTitle>
              <AlertDialogDescription className="text-left leading-relaxed">
                Quedan <strong>{state.days}</strong> día(s) para que expire tu visibilidad en el catálogo. Envía el comprobante
                de renovación desde la pantalla de pago; cuando un administrador lo valide, se extenderá un mes desde tu
                vencimiento actual (si renovás antes, no perdés tiempo ya pagado).
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={dismissReminder}>Entendido</AlertDialogCancel>
              <AlertDialogAction asChild>
                <Link href={RENEW_PAYMENT_HREF} onClick={() => dismissReminder()}>
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
    <div className="border-b border-border/60 bg-muted/35 px-3 py-2 text-center text-xs text-muted-foreground sm:px-4 sm:text-sm">
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
