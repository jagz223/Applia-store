import { useState } from "react";
import { Link } from "wouter";
import { Loader2, Wallet } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CASHEA_ACTIVATION_NOTICE, CASHEA_REQUIRES_WHATSAPP_MESSAGE } from "@shared/store-cashea";
import { normalizeStoreWhatsappPhone } from "@shared/store-whatsapp";
import { storeAdminSectionPath } from "@shared/store-admin-sections";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { storeAdminSectionCardClass } from "@/components/store/store-admin-ui";
import { storeCartQueryKey } from "@/hooks/use-store-cart";
import { storePaymentMethodsQueryKey } from "@/hooks/use-store-payment-methods";

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function StoreCasheaConfigCard({
  storeId,
  slug,
  initialEnabled,
  whatsappPhone,
}: {
  storeId: number;
  slug: string;
  initialEnabled?: boolean;
  whatsappPhone?: string | null;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const hasWhatsapp = Boolean(normalizeStoreWhatsappPhone(whatsappPhone));
  const [enabled, setEnabled] = useState(initialEnabled === true && hasWhatsapp);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const settingsHref = `/tienda/${encodeURIComponent(slug)}/admin/${storeAdminSectionPath("configuracion")}`;

  const saveMutation = useMutation({
    mutationFn: async (nextEnabled: boolean) => {
      const res = await fetch(`/api/stores/${storeId}`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ casheaEnabled: nextEnabled }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudo guardar");
      }
      return res.json();
    },
    onSuccess: (_data, nextEnabled) => {
      setEnabled(nextEnabled);
      void qc.invalidateQueries({ queryKey: ["/api/stores"] });
      void qc.invalidateQueries({ queryKey: storePaymentMethodsQueryKey(storeId) });
      void qc.invalidateQueries({ queryKey: storeCartQueryKey(storeId) });
      toast({
        title: nextEnabled ? "Cashea activado" : "Cashea desactivado",
        description: nextEnabled
          ? "Los clientes verán Cashea como método de pago."
          : "Cashea ya no aparecerá en el checkout.",
      });
    },
  });

  function handleToggle(checked: boolean) {
    if (saveMutation.isPending) return;
    if (checked) {
      if (!hasWhatsapp) {
        toast({
          variant: "destructive",
          title: "WhatsApp requerido",
          description: CASHEA_REQUIRES_WHATSAPP_MESSAGE,
        });
        return;
      }
      setConfirmOpen(true);
      return;
    }
    void saveMutation.mutateAsync(false).catch((e) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: e instanceof Error ? e.message : "No se pudo guardar",
      });
    });
  }

  function confirmActivation() {
    void saveMutation
      .mutateAsync(true)
      .then(() => setConfirmOpen(false))
      .catch((e) => {
        toast({
          variant: "destructive",
          title: "Error",
          description: e instanceof Error ? e.message : "No se pudo guardar",
        });
      });
  }

  return (
    <>
      <Card className={storeAdminSectionCardClass}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display text-lg">
            <Wallet className="h-5 w-5" />
            Activar Cashea
          </CardTitle>
          <CardDescription>
            Ofrece Cashea como método de pago. Los clientes enviarán el pedido por WhatsApp para continuar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-border/70 bg-muted/20 px-4 py-3">
            <div className="space-y-0.5">
              <Label htmlFor="store-cashea-enabled" className="text-sm font-semibold">
                Cashea disponible para clientes
              </Label>
              {hasWhatsapp ? (
                <p className="text-xs text-muted-foreground">
                  Los pedidos con Cashea se envían al WhatsApp de atención de la tienda.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {CASHEA_REQUIRES_WHATSAPP_MESSAGE}{" "}
                  <Link href={settingsHref} className="font-medium text-primary underline-offset-2 hover:underline">
                    Ir a Configuraciones
                  </Link>
                  .
                </p>
              )}
            </div>
            <Switch
              id="store-cashea-enabled"
              checked={enabled}
              disabled={saveMutation.isPending || !hasWhatsapp}
              onCheckedChange={handleToggle}
            />
          </div>
          {saveMutation.isPending ? (
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Guardando…
            </p>
          ) : null}
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Activar Cashea</AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed">
              {CASHEA_ACTIVATION_NOTICE}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saveMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={saveMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                confirmActivation();
              }}
            >
              {saveMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Activar Cashea
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
