import type { LucideIcon } from "lucide-react";
import { Loader2, Package, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { RatingStarsPicker } from "@/components/rating/RatingStarsPicker";
import { initialsFromName } from "@/lib/rating-ui";

export type GoRideRatingModule = "delivery";

export type GoRideRatingPerspective = "rider" | "driver";

type Copy = {
  title: string;
  subtitle: string;
  roleLabel: string;
  serviceBadge: string;
  footerNote: string;
  submitLabel: string;
  HeaderIcon: LucideIcon;
};

function getCopy(perspective: GoRideRatingPerspective): Copy {
  if (perspective === "rider") {
    return {
      title: "¿Cómo fue tu envío?",
      subtitle: "Tu calificación ayuda a otros usuarios a elegir repartidores de confianza.",
      roleLabel: "Repartidor",
      serviceBadge: "Delivery",
      footerNote:
        "Para seguir usando Applia necesitamos tu valoración de este envío. Solo toma unos segundos.",
      submitLabel: "Enviar calificación",
      HeaderIcon: Package,
    };
  }
  return {
    title: "¿Cómo fue la entrega?",
    subtitle: "Tu calificación ayuda a mantener una comunidad de clientes responsables.",
    roleLabel: "Cliente",
    serviceBadge: "Delivery",
    footerNote: "Necesitamos tu valoración para cerrar este envío.",
    submitLabel: "Enviar calificación",
    HeaderIcon: Package,
  };
}

export type GoRideRatingDialogProps = {
  open: boolean;
  module: GoRideRatingModule;
  perspective: GoRideRatingPerspective;
  targetName: string;
  stars: number;
  onStarsChange: (stars: number) => void;
  onSubmit: () => void;
  isSubmitting?: boolean;
  layer?: "default" | "priority";
};

export function GoRideRatingDialog({
  open,
  perspective,
  targetName,
  stars,
  onStarsChange,
  onSubmit,
  isSubmitting = false,
  layer = "priority",
}: GoRideRatingDialogProps) {
  const copy = getCopy(perspective);
  const HeaderIcon = copy.HeaderIcon;

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        hideClose
        layer={layer}
        className="gap-0 overflow-hidden border-border/80 p-0 shadow-2xl sm:max-w-[420px]"
        overlayClassName="bg-black/55 backdrop-blur-[2px]"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="relative overflow-hidden bg-gradient-to-br from-primary/20 via-primary/8 to-background px-6 pb-8 pt-7 text-center"
        >
          <motion.div className="relative mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/15 ring-1 ring-primary/25">
            <HeaderIcon className="h-5 w-5 text-primary" aria-hidden />
          </motion.div>
          <h2 className="font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl">{copy.title}</h2>
          <p className="mx-auto mt-2 max-w-[20rem] text-sm leading-relaxed text-muted-foreground">{copy.subtitle}</p>
          <Badge
            variant="secondary"
            className="mt-3 border-border/60 bg-background/70 text-xs font-medium text-muted-foreground"
          >
            {copy.serviceBadge}
          </Badge>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6 px-6 pb-6 pt-5"
        >
          <motion.div className="mx-auto flex w-fit items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Servicio finalizado
          </motion.div>

          <motion.div className="flex flex-col items-center gap-3 text-center">
            <Avatar className="h-16 w-16 border-2 border-border shadow-md ring-4 ring-primary/20">
              <AvatarFallback className="bg-muted text-lg font-semibold text-foreground">
                {initialsFromName(targetName)}
              </AvatarFallback>
            </Avatar>
            <div className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{copy.roleLabel}</p>
              <p className="font-display text-lg font-bold leading-tight text-foreground">{targetName}</p>
            </div>
          </motion.div>

          <RatingStarsPicker stars={stars} onChange={onStarsChange} />

          <p className="rounded-xl border border-border/80 bg-muted/40 px-3 py-2.5 text-center text-xs leading-relaxed text-muted-foreground">
            {copy.footerNote}
          </p>

          <Button
            className="h-11 w-full rounded-xl text-base font-semibold shadow-sm"
            onClick={onSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Enviando…
              </>
            ) : (
              copy.submitLabel
            )}
          </Button>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
