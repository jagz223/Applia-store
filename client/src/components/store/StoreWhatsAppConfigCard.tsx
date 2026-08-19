import { useState } from "react";
import { Loader2, MessageSquare } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { storeAdminFieldClass, storeAdminSectionCardClass } from "@/components/store/store-admin-ui";

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function StoreWhatsAppConfigCard({ storeId, initialPhone }: { storeId: number; initialPhone?: string | null }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [phone, setPhone] = useState(initialPhone ?? "");

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/stores/${storeId}`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ whatsappPhone: phone.trim() || null }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudo guardar");
      }
      return res.json();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["/api/stores"] });
      toast({ title: "WhatsApp guardado", description: "El número quedó disponible en pedidos y contacto." });
    },
  });

  return (
    <Card className={storeAdminSectionCardClass}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-display text-lg">
          <MessageSquare className="h-5 w-5" />
          WhatsApp de atención
        </CardTitle>
        <CardDescription>
          Número para que clientes y empleados contacten por WhatsApp desde pedidos y la vitrina.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 max-w-md">
          <Label htmlFor="store-whatsapp">Número de WhatsApp</Label>
          <Input
            id="store-whatsapp"
            placeholder="Ej. +593 99 123 4567"
            className={storeAdminFieldClass}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Incluye código de país. Se mostrará junto al chat en pedidos y en «Comunícate con nosotros».
          </p>
        </div>
        <Button
          type="button"
          disabled={saveMutation.isPending}
          onClick={() => void saveMutation.mutateAsync().catch((e) => {
            toast({
              variant: "destructive",
              title: "Error",
              description: e instanceof Error ? e.message : "No se pudo guardar",
            });
          })}
        >
          {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Guardar WhatsApp
        </Button>
      </CardContent>
    </Card>
  );
}
