import { useEffect, useMemo, useState } from "react";
import { Link, useSearch } from "wouter";
import { Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useNoIndex } from "@/hooks/use-no-index";

export default function RevokeRegistration() {
  useNoIndex();
  const search = useSearch();
  const token = useMemo(() => new URLSearchParams(search).get("token")?.trim() ?? "", [search]);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [message, setMessage] = useState("Anulando el registro…");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("Enlace inválido.");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/auth/revoke-registration", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) throw new Error((data as { message?: string }).message || "No se pudo anular");
        setStatus("ok");
        setMessage((data as { message?: string }).message || "Registro anulado.");
      } catch (error) {
        if (cancelled) return;
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "Error al anular");
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
            {status === "loading" ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShieldAlert className="h-5 w-5" />}
            Anular registro
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{message}</p>
          <Button asChild variant="outline" className="rounded-full">
            <Link href="/">Volver al inicio</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
