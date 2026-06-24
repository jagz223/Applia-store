import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  listGoCancellationReasons,
  type GoCancellationModule,
  type GoCancellationParty,
  type GoDriverCancelPhase,
} from "@shared/go-cancellation-feedback";
import { MOBILITY_UI } from "@shared/mobility-ui-labels";

export type GoCancellationFeedbackSubmit = {
  reasonCode: string;
  explanation: string;
  driverPhase?: GoDriverCancelPhase | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  party: GoCancellationParty;
  module: GoCancellationModule;
  driverPhase?: GoDriverCancelPhase | null;
  busy?: boolean;
  onSubmit: (payload: GoCancellationFeedbackSubmit) => void | Promise<void>;
};

export function GoCancellationFeedbackDialog({
  open,
  onOpenChange,
  party,
  module,
  driverPhase = null,
  busy = false,
  onSubmit,
}: Props) {
  const [reasonCode, setReasonCode] = useState<string | null>(null);
  const [explanation, setExplanation] = useState("");

  useEffect(() => {
    if (!open) return;
    setReasonCode(null);
    setExplanation("");
  }, [open]);

  const reasons = useMemo(
    () => listGoCancellationReasons({ party, module, driverPhase }),
    [party, module, driverPhase],
  );

  const serviceLabel = module === "pack" ? MOBILITY_UI.delivery : MOBILITY_UI.taxiService;
  const title =
    party === "rider"
      ? module === "pack"
        ? "Motivo de cancelación del envío"
        : "Motivo de cancelación del viaje"
      : "Motivo de cancelación del servicio";

  const canSubmit = !!reasonCode && explanation.trim().length >= 3;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(92dvh,720px)] max-w-[min(96vw,480px)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Cuéntanos qué ocurrió con tu {serviceLabel.toLowerCase()}. Esta información ayuda a mejorar el servicio.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Selecciona un motivo</Label>
            <div className="space-y-1.5">
              {reasons.map((r) => (
                <button
                  key={r.code}
                  type="button"
                  disabled={busy}
                  onClick={() => setReasonCode(r.code)}
                  className={cn(
                    "w-full rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                    reasonCode === r.code
                      ? "border-primary bg-primary/5 font-medium text-foreground"
                      : "border-border bg-card hover:border-primary/40",
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="go-cancel-explanation">Explique la situación</Label>
            <Textarea
              id="go-cancel-explanation"
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              disabled={busy}
              placeholder="Describe brevemente lo ocurrido…"
              rows={4}
              className="resize-none"
            />
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Volver
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={!canSubmit || busy}
            onClick={() => {
              if (!reasonCode) return;
              void onSubmit({
                reasonCode,
                explanation: explanation.trim(),
                driverPhase: party === "driver" ? driverPhase : null,
              });
            }}
          >
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                Cancelando…
              </>
            ) : (
              "Confirmar cancelación"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
