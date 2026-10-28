import { useState } from "react";
import { Link } from "wouter";
import { Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useNoIndex } from "@/hooks/use-no-index";

export default function ForgotPassword() {
  useNoIndex();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { message?: string }).message || "No se pudo enviar el correo");
      }
      setSent(true);
      toast({
        title: "Revisa tu correo",
        description: (data as { message?: string }).message,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "No se pudo continuar",
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
            <Mail className="h-5 w-5" />
            Recuperar contraseña
          </CardTitle>
          <CardDescription>
            Te enviaremos un enlace a tu correo si la cuenta está verificada y tiene contraseña.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {sent ? (
              <p className="text-sm text-muted-foreground">
                Si corresponde, el correo ya fue enviado. También revisa spam.
              </p>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="forgot-email">Correo</Label>
                <Input
                  id="forgot-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 rounded-2xl"
                  required
                />
              </div>
            )}
          </CardContent>
          <CardFooter className="flex flex-col gap-3 sm:flex-row sm:justify-between">
            <Button type="button" variant="ghost" className="rounded-full" asChild>
              <Link href="/login">Volver al login</Link>
            </Button>
            {!sent ? (
              <Button type="submit" disabled={loading} className="rounded-full">
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Enviar enlace
              </Button>
            ) : null}
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
