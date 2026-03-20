import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Star } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { usePendingRatings, useSubmitRating } from "@/hooks/use-mango-data";
import { useToast } from "@/hooks/use-toast";

function clampStars(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(5, Math.max(1, Math.round(value)));
}

export function RatingGate() {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const { data, isLoading } = usePendingRatings({ enabled: isAuthenticated });
  const submit = useSubmitRating();

  const firstPending = useMemo(() => (data?.pending ?? [])[0] ?? null, [data]);
  const shouldOpen = isAuthenticated && !isLoading && firstPending != null;

  const [stars, setStars] = useState<number>(5);

  useEffect(() => {
    if (firstPending) setStars(5);
  }, [firstPending?.bookingId]);

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
      toast({ title: "¡Gracias!", description: "Calificación enviada correctamente." });
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
        // Bloqueo: no permitir cerrar el modal sin calificar.
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Califica tu experiencia</DialogTitle>
        </DialogHeader>

        {firstPending && (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              {firstPending.roleRated === "professional" ? (
                <p>
                  Debes calificar al asociado <span className="font-medium text-foreground">{firstPending.rateeName}</span>
                  {firstPending.serviceTitle ? (
                    <>
                      {" "}
                      por <span className="font-medium text-foreground">{firstPending.serviceTitle}</span>
                    </>
                  ) : null}
                  .
                </p>
              ) : (
                <p>
                  Debes calificar al cliente <span className="font-medium text-foreground">{firstPending.rateeName}</span>
                  {firstPending.serviceTitle ? (
                    <>
                      {" "}
                      por <span className="font-medium text-foreground">{firstPending.serviceTitle}</span>
                    </>
                  ) : null}
                  .
                </p>
              )}
            </div>

            <div className="flex items-center justify-center gap-2">
              {[1, 2, 3, 4, 5].map((v) => {
                const active = v <= stars;
                return (
                  <button
                    key={v}
                    type="button"
                    className="p-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => setStars(v)}
                    aria-label={`${v} estrellas`}
                  >
                    <Star className={`h-8 w-8 ${active ? "text-amber-500 fill-amber-500" : "text-muted-foreground"}`} />
                  </button>
                );
              })}
            </div>

            <Button className="w-full" onClick={onSubmit} disabled={submit.isPending}>
              {submit.isPending ? "Enviando…" : "Enviar calificación"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

