import { useRef, useState } from "react";
import { Loader2, PartyPopper, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useRedeemPromotionalCode } from "@/hooks/use-promotional-codes";
import type { RedeemPromotionalCodeDiscount, RedeemPromotionalCodeFreeMonths } from "@shared/promotional-code-schema";
import {
  PROMO_CODE_MSG_ALREADY_REDEEMED_BY_USER,
  PROMO_CODE_MSG_NO_LONGER_AVAILABLE,
} from "@shared/promotional-code-utils";
import { cn } from "@/lib/utils";

function isPromoSoftNotice(message: string): boolean {
  return message === PROMO_CODE_MSG_ALREADY_REDEEMED_BY_USER || message === PROMO_CODE_MSG_NO_LONGER_AVAILABLE;
}

type SubscriptionPromoCodeApplyProps = {
  monthlyUsd: number;
  subscriptionMonths: number;
  disabled?: boolean;
  onFreeMonthsApplied: (result: RedeemPromotionalCodeFreeMonths) => void;
  onDiscountApplied: (result: RedeemPromotionalCodeDiscount, code: string) => void;
};

export function SubscriptionPromoCodeApply({
  monthlyUsd,
  subscriptionMonths,
  disabled = false,
  onFreeMonthsApplied,
  onDiscountApplied,
}: SubscriptionPromoCodeApplyProps) {
  const redeemMutation = useRedeemPromotionalCode();
  const freeMonthsDismissHandledRef = useRef(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [codeDraft, setCodeDraft] = useState("");
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [discountSuccessOpen, setDiscountSuccessOpen] = useState(false);
  const [freeMonthsSuccess, setFreeMonthsSuccess] = useState<RedeemPromotionalCodeFreeMonths | null>(null);

  const handleApply = async () => {
    const code = codeDraft.trim();
    if (!code) {
      setInlineError("Escribe un código para continuar.");
      return;
    }

    setInlineError(null);
    try {
      const result = await redeemMutation.mutateAsync({
        code,
        subscriptionMonths,
        monthlyUsd,
      });

      setModalOpen(false);
      setCodeDraft("");

      if (result.applied === "meses_gratuitos") {
        freeMonthsDismissHandledRef.current = false;
        setFreeMonthsSuccess(result);
        return;
      }

      onDiscountApplied(result, code);
      setDiscountSuccessOpen(true);
    } catch (err) {
      setInlineError((err as Error).message ?? "No se pudo aplicar el código.");
    }
  };

  return (
    <>
      <div className="space-y-2">
        <Button
          type="button"
          variant="ghost"
          className="h-auto p-0 text-sm text-muted-foreground hover:text-primary"
          disabled={disabled || redeemMutation.isPending}
          onClick={() => {
            setInlineError(null);
            setModalOpen(true);
          }}
        >
          <Tag className="h-3.5 w-3.5 mr-1.5 inline" />
          Añadir código
        </Button>

        {inlineError && !modalOpen ? (
          <Alert
            variant={isPromoSoftNotice(inlineError) ? "default" : "destructive"}
            className={cn(
              isPromoSoftNotice(inlineError)
                ? "border-border bg-muted/40 text-muted-foreground"
                : "border-destructive/50 bg-destructive/10",
            )}
          >
            <AlertDescription className={isPromoSoftNotice(inlineError) ? "text-sm leading-relaxed" : undefined}>
              {inlineError}
            </AlertDescription>
          </Alert>
        ) : null}
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md border-border bg-card">
          <DialogHeader>
            <DialogTitle>Código promocional</DialogTitle>
            <DialogDescription>
              Introduce tu código para aplicar meses gratuitos o un descuento en esta mensualidad.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="subscription-promo-code">Código</Label>
              <Input
                id="subscription-promo-code"
                placeholder="Ej: PROMO2026"
                value={codeDraft}
                onChange={(e) => {
                  setCodeDraft(e.target.value.toUpperCase());
                  if (inlineError) setInlineError(null);
                }}
                className="font-mono uppercase"
                autoComplete="off"
                disabled={redeemMutation.isPending}
              />
            </div>

            {inlineError ? (
              <Alert
                variant={isPromoSoftNotice(inlineError) ? "default" : "destructive"}
                className={cn(
                  isPromoSoftNotice(inlineError)
                    ? "border-border bg-muted/40 text-muted-foreground"
                    : "border-destructive/50 bg-destructive/10",
                )}
              >
                <AlertDescription className={isPromoSoftNotice(inlineError) ? "text-sm leading-relaxed" : undefined}>
                  {inlineError}
                </AlertDescription>
              </Alert>
            ) : null}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setModalOpen(false)}
              disabled={redeemMutation.isPending}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={handleApply} disabled={redeemMutation.isPending}>
              {redeemMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={freeMonthsSuccess != null}
        onOpenChange={(open) => {
          if (open || !freeMonthsSuccess) return;
          if (freeMonthsDismissHandledRef.current) return;
          freeMonthsDismissHandledRef.current = true;
          const applied = freeMonthsSuccess;
          setFreeMonthsSuccess(null);
          onFreeMonthsApplied(applied);
        }}
      >
        <DialogContent className="sm:max-w-md border-border bg-card text-center">
          <DialogHeader className="items-center sm:text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-500/15 text-green-600">
              <PartyPopper className="h-6 w-6" aria-hidden />
            </div>
            <DialogTitle className="text-xl">Código promocional activado</DialogTitle>
            <DialogDescription className="text-center text-base text-foreground">
              {freeMonthsSuccess ? (
                <>
                  Se activaron correctamente{" "}
                  <strong>
                    {freeMonthsSuccess.monthsGranted} mes
                    {freeMonthsSuccess.monthsGranted === 1 ? "" : "es"}
                  </strong>{" "}
                  de visibilidad en el catálogo.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-center">
            <Button
              type="button"
              onClick={() => {
                if (!freeMonthsSuccess || freeMonthsDismissHandledRef.current) return;
                freeMonthsDismissHandledRef.current = true;
                const applied = freeMonthsSuccess;
                setFreeMonthsSuccess(null);
                onFreeMonthsApplied(applied);
              }}
            >
              Continuar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={discountSuccessOpen} onOpenChange={setDiscountSuccessOpen}>
        <DialogContent className="sm:max-w-md border-border bg-card text-center">
          <DialogHeader className="items-center sm:text-center">
            <DialogTitle className="text-xl">
              ¡Enhorabuena! Se ha aplicado tu descuento para esta mensualidad.
            </DialogTitle>
            <DialogDescription className="text-center">
              Puedes continuar con el pago usando el nuevo total rebajado que verás en pantalla.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-center">
            <Button type="button" onClick={() => setDiscountSuccessOpen(false)}>
              Continuar con el pago
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
