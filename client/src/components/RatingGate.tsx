import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { usePendingRatings, useSubmitRating } from "@/hooks/use-mango-data";
import { useToast } from "@/hooks/use-toast";
import { RatingStarsPicker } from "@/components/rating/RatingStarsPicker";
import { clampStars, initialsFromName } from "@/lib/rating-ui";

export function RatingGate() {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const { data, isLoading } = usePendingRatings({ enabled: isAuthenticated });
  const submit = useSubmitRating();

  const firstPending = useMemo(() => (data?.pending ?? [])[0] ?? null, [data]);
  const pendingCount = data?.pending?.length ?? 0;
  const shouldOpen = isAuthenticated && !isLoading && firstPending != null;

  const [stars, setStars] = useState<number>(5);

  useEffect(() => {
    if (firstPending) setStars(5);
  }, [firstPending?.bookingId]);

  const isProfessional = firstPending?.roleRated === "professional";

  const onSubmit = async () => {
    if (!firstPending) return;
    const safeStars = clampStars(stars);
    try {
      await submit.mutateAsync({
        bookingId: firstPending.bookingId,
        ratedUserId: firstPending.rateeUserId,
        roleRated: firstPending.roleRated,
        stars: safeStars,
      });
      toast({ title: "¡Gracias!", description: "Tu opinión ayuda a mejorar la comunidad GenFeb." });
    } catch (e) {
      toast({
        title: "No se pudo enviar",
        description: e instanceof Error ? e.message : "Intenta nuevamente",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog
      open={shouldOpen}
      onOpenChange={() => {
        /* Bloqueo: no permitir cerrar sin calificar. */
      }}
    >
      <DialogContent
        hideClose
        className="gap-0 overflow-hidden border-border/80 p-0 shadow-2xl sm:max-w-[420px]"
        overlayClassName="bg-black/55 backdrop-blur-[2px]"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {firstPending ? (
          <>
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="relative overflow-hidden bg-gradient-to-br from-primary/20 via-primary/8 to-background px-6 pb-8 pt-7 text-center"
            >
              <motion.div
                aria-hidden
                className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-primary/15 blur-2xl"
                animate={{ scale: [1, 1.08, 1], opacity: [0.5, 0.75, 0.5] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              />
              <motion.div
                aria-hidden
                className="pointer-events-none absolute -bottom-4 left-4 h-20 w-20 rounded-full bg-amber-500/10 blur-xl"
                animate={{ scale: [1, 1.12, 1] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 0.6 }}
              />

              <motion.div className="relative mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/15 ring-1 ring-primary/25">
                <Sparkles className="h-5 w-5 text-primary" aria-hidden />
              </motion.div>

              <h2 className="font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                ¿Cómo fue tu experiencia?
              </h2>
              <p className="mx-auto mt-2 max-w-[18rem] text-sm leading-relaxed text-muted-foreground">
                {isProfessional
                  ? "Tu calificación ayuda a otros usuarios a elegir con confianza."
                  : "Tu calificación ayuda al asociado a seguir creciendo en GenFeb."}
              </p>

              {pendingCount > 1 ? (
                <Badge variant="secondary" className="mt-3 border-border/60 bg-background/70 text-xs font-medium">
                  {pendingCount} pendientes · empezamos por esta
                </Badge>
              ) : null}
            </motion.div>

            <motion.div
              key={firstPending.bookingId}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: 0.05 }}
              className="space-y-6 px-6 pb-6 pt-5"
            >
              <div className="flex flex-col items-center gap-3 text-center">
                <Avatar className="h-16 w-16 border-2 border-border shadow-md ring-4 ring-primary/20">
                  <AvatarFallback className="bg-muted text-lg font-semibold text-foreground">
                    {initialsFromName(firstPending.rateeName)}
                  </AvatarFallback>
                </Avatar>

                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: 0.05 }}
                  className="space-y-1.5"
                >
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {isProfessional ? "Asociado" : "Cliente"}
                  </p>
                  <p className="font-display text-lg font-bold leading-tight text-foreground">
                    {firstPending.rateeName}
                  </p>
                  {firstPending.serviceTitle ? (
                    <Badge
                      variant="outline"
                      className="max-w-[280px] truncate border-primary/25 bg-primary/5 px-3 py-1 text-xs font-medium text-foreground"
                    >
                      {firstPending.serviceTitle}
                    </Badge>
                  ) : null}
                </motion.div>
              </div>

              <RatingStarsPicker stars={stars} onChange={setStars} />

              <p className="rounded-xl border border-border/80 bg-muted/40 px-3 py-2.5 text-center text-xs leading-relaxed text-muted-foreground">
                Para seguir usando GenFeb necesitamos tu valoración de este servicio. Solo toma unos segundos.
              </p>

              <Button
                className="h-11 w-full rounded-xl text-base font-semibold shadow-sm"
                onClick={onSubmit}
                disabled={submit.isPending}
              >
                {submit.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Enviando…
                  </>
                ) : (
                  "Enviar calificación"
                )}
              </Button>
            </motion.div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
