import { useEffect, useMemo, useState } from "react";
import { Link, useSearch } from "wouter";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useNoIndex } from "@/hooks/use-no-index";

export default function VerifyEmail() {
  useNoIndex();
  const search = useSearch();
  const token = useMemo(() => new URLSearchParams(search).get("token")?.trim() ?? "", [search]);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [message, setMessage] = useState("Confirmando tu correo…");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("Enlace inválido.");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) throw new Error((data as { message?: string }).message || "No se pudo verificar");
        setStatus("ok");
        setMessage((data as { message?: string }).message || "Correo confirmado.");
      } catch (error) {
        if (cancelled) return;
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "Error al verificar");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-1 items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md rounded-3xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {status === "loading" ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
            {status === "ok" ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : null}
            {status === "error" ? <XCircle className="h-5 w-5 text-destructive" /> : null}
            Verificación de correo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{message}</p>
          <Button asChild className="rounded-full">
            <Link href="/login">Ir al login</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
