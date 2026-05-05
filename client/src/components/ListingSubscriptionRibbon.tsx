import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { AlertTriangle, CalendarClock } from "lucide-react";
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
  const { isAuthenticated } = useAuth();
  const { data: provider } = useCurrentProvider();
  const { toast } = useToast();
  const [reminderOpen, setReminderOpen] = useState(false);
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
    const urgent = !expired && days > 0 && days <= LISTING_SUBSCRIPTION_WARNING_DAYS;
    const endDate = new Date(endsAt);
    const endLabel = Number.isNaN(endDate.getTime())
      ? endsAt
      : endDate.toLocaleString("es-EC", { dateStyle: "medium", timeStyle: "short" });

    return { days, expired, urgent, endsAt, endLabel };
  }, [isAuthenticated, provider]);

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

  const dismissReminder = useCallback(() => setReminderOpen(false), []);

  if (!state) return null;

  if (state.expired) {
    return (
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
                  Renová USD 15 y envía el comprobante. Si pagás antes de que venza el período, al validarlo se suma un
                  mes completo desde la fecha que tenías pendiente.
                </p>
              </div>
            </div>
            <Button size="sm" variant="secondary" className="shrink-0 border border-amber-600/35" asChild>
              <Link href={RENEW_PAYMENT_HREF}>Ir a renovar</Link>
            </Button>
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
          Visibilidad en catálogo activa hasta <strong className="text-foreground">{state.endLabel}</strong>
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
      </span>
    </div>
  );
}
