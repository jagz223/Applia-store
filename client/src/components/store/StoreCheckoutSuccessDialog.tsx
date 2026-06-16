import { Link } from "wouter";
import { CheckCircle2, ShoppingBag, UserCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type StoreCheckoutSuccessDialogProps = {
  open: boolean;
  orderId: number | null;
  onOpenChange: (open: boolean) => void;
};

export function StoreCheckoutSuccessDialog({
  open,
  orderId,
  onOpenChange,
}: StoreCheckoutSuccessDialogProps) {
  return (
    <Dialog open={open} onOpenChange={() => { /* solo se cierra con los botones */ }}>
      <DialogContent
        className="max-w-md"
        hideClose
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            ¡Compra registrada!
          </DialogTitle>
          <DialogDescription>
            {orderId != null
              ? `Tu pedido #${orderId} fue enviado. La tienda revisará tu comprobante y actualizará el estado.`
              : "Tu pedido fue enviado. La tienda revisará tu comprobante y actualizará el estado."}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3 text-sm">
          <p className="font-medium text-foreground">
            Para ver el estado de tu orden, dirígete al apartado de tus compras:
          </p>
          <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
            <li className="flex items-start gap-2">
              <UserCircle className="h-4 w-4 shrink-0 mt-0.5 text-primary" aria-hidden />
              <span>
                Haz clic en tu <strong className="text-foreground">foto o nombre</strong> en la barra superior para
                abrir el menú de usuario.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <ShoppingBag className="h-4 w-4 shrink-0 mt-0.5 text-primary" aria-hidden />
              <span>
                Selecciona <strong className="text-foreground">Mis pedidos de tienda</strong>.
              </span>
            </li>
            <li>
              Ahí podrás consultar el progreso{orderId != null ? ` de la orden #${orderId}` : " de tu pedido"} y ver
              cada cambio de estado.
            </li>
          </ol>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          <Button type="button" className="w-full sm:w-auto" asChild>
            <Link
              href={orderId != null ? `/pedidos-tienda?orderId=${orderId}` : "/pedidos-tienda"}
              onClick={() => onOpenChange(false)}
            >
              Ir a mis pedidos
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
