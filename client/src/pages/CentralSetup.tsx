import { useState } from "react";
import { Link, Redirect, useLocation } from "wouter";
import { Building2, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { canAccessCentralDashboard } from "@/lib/auth-utils";
import { isCentralRole } from "@shared/roles";
import { useSetupCentralCompany } from "@/hooks/use-central";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export default function CentralSetup() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const setup = useSetupCentralCompany();
  const [name, setName] = useState("");

  if (authLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || !canAccessCentralDashboard(user)) {
    return <Redirect to="/login" />;
  }

  const isCentral = isCentralRole((user as { role?: string }).role);
  const pending = (user as { pendingCentralSetup?: boolean }).pendingCentralSetup === true;
  const companyId = String((user as { dispatchCompanyId?: string }).dispatchCompanyId ?? "").trim();

  if (!isCentral) {
    return <Redirect to="/" />;
  }

  if (!pending && companyId) {
    return <Redirect to="/central" />;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      toast({
        variant: "destructive",
        title: "Nombre requerido",
        description: "Escribe al menos 2 caracteres para el nombre de tu central.",
      });
      return;
    }
    setup.mutate(trimmed, {
      onSuccess: () => {
        toast({
          title: "Central lista",
          description: "Ya puedes usar el panel de tu central.",
        });
        setLocation("/central");
      },
      onError: (err: Error) => {
        toast({
          variant: "destructive",
          title: "No se pudo guardar",
          description: err.message,
        });
      },
    });
  };

  return (
    <div className="container mx-auto max-w-lg px-4 py-10 sm:py-14">
      <Card className="border-primary/20 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Building2 className="h-6 w-6 text-primary" />
            Nombre de tu central
          </CardTitle>
          <CardDescription>
            Tu rol fue actualizado a <strong>Central</strong>. Elige un nombre único para tu empresa despachadora; no
            puede coincidir con otra central ya registrada.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="central-name">Nombre de la central</Label>
              <Input
                id="central-name"
                placeholder="Ej. Central Man Go Norte"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={setup.isPending}
                maxLength={120}
                autoFocus
              />
            </div>
            <Button type="submit" className="w-full" disabled={setup.isPending || !name.trim()}>
              {setup.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Guardando…
                </>
              ) : (
                "Continuar al panel"
              )}
            </Button>
            <Button type="button" variant="ghost" className="w-full" asChild>
              <Link href="/">Volver al inicio</Link>
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
