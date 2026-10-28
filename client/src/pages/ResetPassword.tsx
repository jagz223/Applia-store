import { useMemo, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { Loader2, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useNoIndex } from "@/hooks/use-no-index";

export default function ResetPassword() {
  useNoIndex();
  const search = useSearch();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const token = useMemo(() => new URLSearchParams(search).get("token")?.trim() ?? "", [search]);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      toast({ variant: "destructive", title: "Enlace inválido" });
      return;
    }
    if (newPassword.length < 6 || newPassword !== confirmPassword) {
      toast({
        variant: "destructive",
        title: "Revisa la contraseña",
        description: "Mínimo 6 caracteres y ambas deben coincidir.",
      });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { message?: string }).message || "No se pudo restablecer");
      toast({ title: "Contraseña actualizada", description: "Ya puedes iniciar sesión." });
      setLocation("/login");
    } catch (error) {
      toast({
        variant: "destructive",
        title: "No se pudo restablecer",
        description: error instanceof Error ? error.message : "Error desconocido",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-1 items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md rounded-3xl border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <KeyRound className="h-5 w-5" />
            Nueva contraseña
          </CardTitle>
          <CardDescription>Elige una contraseña nueva para tu cuenta.</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {!token ? (
              <p className="text-sm text-destructive">Falta el token del enlace. Solicita uno nuevo.</p>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="reset-password">Nueva contraseña</Label>
                  <Input
                    id="reset-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="h-11 rounded-2xl"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reset-confirm">Confirmar</Label>
                  <Input
                    id="reset-confirm"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="h-11 rounded-2xl"
                    required
                  />
                </div>
              </>
            )}
          </CardContent>
          <CardFooter className="flex justify-between gap-3">
            <Button type="button" variant="ghost" className="rounded-full" asChild>
              <Link href="/forgot-password">Solicitar otro enlace</Link>
            </Button>
            <Button type="submit" disabled={loading || !token} className="rounded-full">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Guardar
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
