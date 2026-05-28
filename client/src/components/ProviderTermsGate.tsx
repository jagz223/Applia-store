import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth, type AuthUser } from "@/hooks/use-auth";
import { userCanActAsAssociate } from "@/lib/user-permissions";
import { api } from "@shared/routes";
import { ProviderTermsOfUseContent } from "@/constants/provider-terms-of-use-es";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

async function acceptProviderTermsOfUse(): Promise<{ user: AuthUser }> {
  const token = localStorage.getItem("token");
  const res = await fetch(api.auth.acceptProviderTermsOfUse.path, {
    method: api.auth.acceptProviderTermsOfUse.method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || "No se pudo registrar la aceptación");
  }
  return res.json();
}

/**
 * Modal bloqueante para profesionales que aún no han aceptado las condiciones de uso.
 * Solo se cierra al pulsar Aceptar (actualiza `acceptedProviderTermsOfUse` en el servidor).
 */
export function ProviderTermsGate() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const needsAccept =
    isAuthenticated &&
    user != null &&
    userCanActAsAssociate(user) &&
    user.acceptedProviderTermsOfUse !== true;

  const mutation = useMutation({
    mutationFn: acceptProviderTermsOfUse,
    onSuccess: (data) => {
      queryClient.setQueryData<AuthUser | null>(["user"], data.user);
    },
    onError: (e: Error) => {
      toast({
        title: "Error",
        description: e.message,
        variant: "destructive",
      });
    },
  });

  if (isLoading || !needsAccept) {
    return null;
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          /* No permitir cerrar sin aceptar */
        }
      }}
    >
      <DialogContent
        hideClose
        className={cn(
          /* Sobrescribe grid + centrado vertical (recorta modales altos) */
          "!flex !flex-col !gap-0 !p-0",
          "left-[50%] top-[4vh] max-h-[min(92vh,720px)] w-[calc(100vw-1.5rem)] max-w-xl sm:max-w-2xl",
          "-translate-x-1/2 !translate-y-0",
          "overflow-hidden rounded-xl border bg-card shadow-2xl ring-1 ring-border/40",
        )}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="shrink-0 space-y-1 border-b bg-muted/30 px-5 py-4 text-left sm:px-6">
          <DialogTitle className="text-left text-base font-semibold leading-snug sm:text-lg">
            Condiciones de uso para prestadores
          </DialogTitle>
          <p className="text-left text-xs text-muted-foreground sm:text-sm">
            Lee el documento completo y desplázate con la barra lateral. Debes aceptar para continuar.
          </p>
        </DialogHeader>

        {/* Cuerpo con altura acotada y scroll nativo (más fiable que flex-1 en grid) */}
        <div
          className={cn(
            "w-full overflow-y-auto overflow-x-hidden overscroll-contain",
            "max-h-[min(calc(92vh-10.5rem),600px)] min-h-[200px]",
            "px-5 py-5 sm:px-6",
            "[scrollbar-width:thin] [scrollbar-color:hsl(var(--border))_transparent]",
            "[&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border/70",
          )}
          tabIndex={0}
          role="region"
          aria-label="Texto de condiciones de uso"
        >
          <ProviderTermsOfUseContent />
        </div>

        <DialogFooter className="shrink-0 flex-col gap-2 border-t bg-muted/20 px-5 py-4 sm:flex-row sm:justify-center sm:px-6">
          <Button
            type="button"
            size="lg"
            className="w-full min-w-[200px] sm:w-auto"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Guardando…
              </>
            ) : (
              "Aceptar condiciones de uso"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
