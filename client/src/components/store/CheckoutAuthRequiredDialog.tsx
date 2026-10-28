import { Link } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SocialAuthButtons } from "@/components/auth/SocialAuthButtons";
import { mergeGuestStoreCartToServer } from "@/lib/guest-store-cart";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { storeCartQueryKey } from "@/hooks/use-store-cart";
import type { StoreProductCatalogKind } from "@shared/store-schema";

type CheckoutAuthRequiredDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: number;
  cartKind?: StoreProductCatalogKind;
  onAuthenticated?: () => void;
};

export function CheckoutAuthRequiredDialog({
  open,
  onOpenChange,
  storeId,
  cartKind = "retail",
  onAuthenticated,
}: CheckoutAuthRequiredDialogProps) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const afterAuth = async () => {
    try {
      await mergeGuestStoreCartToServer(storeId, cartKind);
      await qc.invalidateQueries({ queryKey: storeCartQueryKey(storeId, cartKind) });
      onOpenChange(false);
      onAuthenticated?.();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Sesión lista, carrito no sincronizado",
        description: error instanceof Error ? error.message : "Error al unir el carrito",
      });
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle>Necesitas registrarte</DialogTitle>
          <DialogDescription>
            Puedes armar el carrito sin cuenta. Para comprar, regístrate o inicia sesión.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <Button asChild className="h-11 w-full rounded-full font-semibold">
            <Link
              href="/register"
              onClick={() => {
                sessionStorage.setItem("postLoginRedirect", window.location.pathname + window.location.search);
              }}
            >
              Registrarse
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-11 w-full rounded-full">
            <Link
              href="/login"
              onClick={() => {
                sessionStorage.setItem("postLoginRedirect", window.location.pathname + window.location.search);
              }}
            >
              Ya tengo cuenta — iniciar sesión
            </Link>
          </Button>
          <div className="relative py-1">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">O desde acá</span>
            </div>
          </div>
          <SocialAuthButtons onSuccess={() => void afterAuth()} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
