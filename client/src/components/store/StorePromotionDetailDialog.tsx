import type { StorePromotionSummary } from "@/hooks/use-store-promotions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function formatPrice(value: number) {
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(value);
}

export function StorePromotionDetailDialog({
  promotion,
  open,
  onOpenChange,
}: {
  promotion: StorePromotionSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!promotion) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent layer="elevated" className="max-w-md">
        <DialogHeader>
          <DialogTitle>{promotion.name}</DialogTitle>
          <DialogDescription>Detalle de la promoción</DialogDescription>
        </DialogHeader>
        {promotion.imageUrl ? (
          <div className="aspect-[4/3] rounded-lg border border-border overflow-hidden bg-muted/30">
            <img src={promotion.imageUrl} alt="" className="h-full w-full object-cover" />
          </div>
        ) : null}
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="font-medium text-muted-foreground">Precio del pack</dt>
            <dd className="text-base font-semibold">{formatPrice(promotion.price)}</dd>
          </div>
          {promotion.description ? (
            <div>
              <dt className="font-medium text-muted-foreground">Descripción</dt>
              <dd className="whitespace-pre-wrap">{promotion.description}</dd>
            </div>
          ) : null}
          <div>
            <dt className="font-medium text-muted-foreground">Estado</dt>
            <dd>{promotion.status === "active" ? "Activa" : "Inactiva"}</dd>
          </div>
          <div>
            <dt className="font-medium text-muted-foreground mb-2">Productos incluidos</dt>
            <dd>
              {promotion.items.length === 0 ? (
                "Ninguno"
              ) : (
                <ul className="rounded-md border border-border divide-y divide-border">
                  {promotion.items.map((item) => (
                    <li key={item.productId} className="flex justify-between gap-2 px-3 py-2">
                      <span className="truncate">{item.productName}</span>
                      <span className="shrink-0 text-muted-foreground">
                        ×{item.quantity}
                        {item.status === "inactive" ? " · inactivo" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </dd>
          </div>
        </dl>
      </DialogContent>
    </Dialog>
  );
}
