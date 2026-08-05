import { useEffect, useState } from "react";
import { Download, FileText, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type StoreOrderInvoicePdfDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: number;
  orderId: number | null;
};

export function StoreOrderInvoicePdfDialog({
  open,
  onOpenChange,
  storeId,
  orderId,
}: StoreOrderInvoicePdfDialogProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || orderId == null) return;

    let revoked = false;
    let objectUrl: string | null = null;
    const controller = new AbortController();

    (async () => {
      setLoading(true);
      setError(null);
      setBlobUrl(null);
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`/api/stores/${storeId}/orders/${orderId}/invoice.pdf`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: controller.signal,
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(
            (data as { message?: string }).message || "No se pudo generar la factura.",
          );
        }
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        if (revoked) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setBlobUrl(objectUrl);
      } catch (e) {
        if ((e as { name?: string })?.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "No se pudo cargar el PDF.");
      } finally {
        if (!revoked) setLoading(false);
      }
    })();

    return () => {
      revoked = true;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, storeId, orderId]);

  useEffect(() => {
    if (open) return;
    setBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setError(null);
    setLoading(false);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex max-h-[min(92vh,900px)] w-[min(96vw,56rem)] max-w-none flex-col gap-0 overflow-hidden p-0",
          "rounded-[1.25rem] sm:rounded-[1.5rem]",
        )}
      >
        <DialogHeader className="shrink-0 space-y-1 border-b border-border/60 px-5 py-4 pr-12 text-left">
          <DialogTitle className="font-display flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5 text-secondary dark:text-primary" />
            Factura de la orden {orderId != null ? `#${orderId}` : ""}
          </DialogTitle>
          <DialogDescription>
            Vista previa del PDF. Desde el visor puedes descargar o imprimir.
          </DialogDescription>
        </DialogHeader>

        <div className="relative min-h-0 flex-1 bg-muted/30">
          {loading ? (
            <div className="flex h-[min(70vh,640px)] items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              Generando factura…
            </div>
          ) : error ? (
            <div className="flex h-[min(40vh,320px)] flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-sm text-destructive">{error}</p>
              <Button type="button" variant="outline" className="rounded-full" onClick={() => onOpenChange(false)}>
                <X className="mr-1.5 h-4 w-4" />
                Cerrar
              </Button>
            </div>
          ) : blobUrl ? (
            <iframe
              title={`Factura orden ${orderId ?? ""}`}
              src={blobUrl}
              className="h-[min(70vh,640px)] w-full border-0 bg-background"
            />
          ) : null}
        </div>

        {blobUrl ? (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border/60 px-5 py-3">
            <Button type="button" variant="outline" className="rounded-full" asChild>
              <a href={blobUrl} download={`factura-orden-${orderId ?? "pedido"}.pdf`}>
                <Download className="mr-1.5 h-4 w-4" />
                Descargar PDF
              </a>
            </Button>
            <Button type="button" className="rounded-full font-semibold" onClick={() => onOpenChange(false)}>
              Cerrar
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
