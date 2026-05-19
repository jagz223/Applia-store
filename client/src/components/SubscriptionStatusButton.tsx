import { useMemo, useState } from "react";
import { Link } from "wouter";
import { CreditCard, ShieldCheck } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
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
import { useCurrentProvider, useVerifyingStatusMe } from "@/hooks/use-mango-data";
import {
  LISTING_SUBSCRIPTION_WARNING_DAYS,
  listingSubscriptionDaysRemaining,
} from "@shared/professional-listing-subscription";

import { prepareRenewalPaymentNavigation, VERIFY_PAYMENT_PATH } from "@/lib/verify-return-path";

const RENEW_PAYMENT_HREF = VERIFY_PAYMENT_PATH;

export function SubscriptionStatusButton(props: { label?: string } & ButtonProps) {
  const { label = "Mi Suscripción", ...btn } = props;
  const [open, setOpen] = useState(false);
  const { data: provider } = useCurrentProvider();
  // El endpoint requiere provider; si no existe, devuelve 403 y el hook retorna null en queryFn.
  const { data: verifyingStatus } = useVerifyingStatusMe(Boolean(provider));

  const state = useMemo(() => {
    const p = provider as
      | {
          isVerified?: boolean;
          isListingPublished?: boolean;
          visibilitySubscriptionEndsAt?: string | null;
          subscriptionDaysRemaining?: number | null;
        }
      | null
      | undefined;
    if (!p?.isVerified) return null;

    const endsAt = p.visibilitySubscriptionEndsAt ?? null;
    const days =
      p.subscriptionDaysRemaining ??
      (endsAt ? listingSubscriptionDaysRemaining(endsAt) : null) ??
      null;

    const expired = p.isListingPublished === false || (typeof days === "number" && days <= 0);
    const pending = verifyingStatus?.transacction_verified === "pending";
    const needsRenew = expired || (typeof days === "number" && days <= LISTING_SUBSCRIPTION_WARNING_DAYS);

    return {
      endsAt,
      days,
      expired,
      pending,
      needsRenew,
    };
  }, [provider, verifyingStatus?.transacction_verified]);

  return (
    <>
      <Button
        {...btn}
        onClick={(e) => {
          btn.onClick?.(e);
          setOpen(true);
        }}
      >
        <ShieldCheck className="h-4 w-4 mr-2" />
        {label}
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mi Suscripción</AlertDialogTitle>
            {state ? (
              <AlertDialogDescription asChild>
                <div className="text-left text-sm leading-relaxed text-muted-foreground">
                  <div className="mt-2 space-y-1">
                    <p>
                      <span className="text-muted-foreground">Estado:</span>{" "}
                      <span className="font-semibold text-foreground">
                        {state.pending ? "En revisión" : state.expired ? "Vencido" : "Activo"}
                      </span>
                    </p>
                    <p>
                      <span className="text-muted-foreground">Tiempo restante:</span>{" "}
                      <span className="font-semibold text-foreground">
                        {typeof state.days === "number" ? `Te quedan ${state.days} día(s)` : "—"}
                      </span>
                    </p>
                  </div>
                  {!state.pending ? (
                    <p className="mt-3 text-xs">
                      Puedes pagar <strong className="text-foreground">varios meses</strong> (hasta 1 año) para
                      extender tu visibilidad.
                    </p>
                  ) : (
                    <p className="mt-3 text-xs">
                      Ya tienes un comprobante en revisión. Cuando sea validado podrás volver a registrar un nuevo pago.
                    </p>
                  )}
                </div>
              </AlertDialogDescription>
            ) : (
              <AlertDialogDescription className="text-left leading-relaxed">
                Esta sección aparece cuando tu cuenta está registrada como asociado.
              </AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cerrar</AlertDialogCancel>
            {state ? (
              state.pending ? (
                <AlertDialogAction disabled>
                  <span className="inline-flex items-center">
                    <CreditCard className="h-4 w-4 mr-2" />
                    En revisión
                  </span>
                </AlertDialogAction>
              ) : (
                <AlertDialogAction asChild>
                  <Link href={RENEW_PAYMENT_HREF} onClick={prepareRenewalPaymentNavigation}>
                    <span className="inline-flex items-center">
                      <CreditCard className="h-4 w-4 mr-2" />
                      {state.needsRenew ? "Renovar Suscripción" : "Pagar más meses"}
                    </span>
                  </Link>
                </AlertDialogAction>
              )
            ) : null}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

