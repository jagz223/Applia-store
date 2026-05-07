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

const RENEW_PAYMENT_HREF = "/professional/verify/payment";

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
            <AlertDialogDescription className="text-left leading-relaxed">
              {state ? (
                <>
                  <div className="mt-2 space-y-1 text-sm">
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
                </>
              ) : (
                "Esta sección aparece cuando tu cuenta está registrada como asociado."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cerrar</AlertDialogCancel>
            {state?.needsRenew ? (
              <AlertDialogAction asChild>
                <Link href={RENEW_PAYMENT_HREF}>
                  <span className="inline-flex items-center">
                    <CreditCard className="h-4 w-4 mr-2" />
                    Renovar Suscripción
                  </span>
                </Link>
              </AlertDialogAction>
            ) : null}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

