import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { prepareRenewalPaymentNavigation, VERIFY_PAYMENT_PATH } from "@/lib/verify-return-path";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  size?: "sm" | "default";
  variant?: "default" | "outline";
};

/** CTA único hacia renovación de suscripción de visibilidad (el monto se muestra en esa pantalla). */
export function ListingSubscriptionRenewButton({
  className,
  size = "sm",
  variant = "outline",
}: Props) {
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={cn(variant === "outline" && "border-amber-600/40 bg-background/80", className)}
      asChild
    >
      <Link href={VERIFY_PAYMENT_PATH} onClick={prepareRenewalPaymentNavigation}>
        Renovar suscripción
      </Link>
    </Button>
  );
}
