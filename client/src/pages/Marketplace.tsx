import { Link } from "wouter";
import { Store, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Marketplace Applia — sección en preparación (visibilidad según panel admin). */
export default function Marketplace() {
  return (
    <div className="container mx-auto max-w-lg px-4 py-12">
      <Button variant="ghost" size="sm" className="mb-6 -ml-2 gap-2" asChild>
        <Link href="/">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Inicio
        </Link>
      </Button>
      <Card className="border-border/60 shadow-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Store className="h-7 w-7" aria-hidden />
          </div>
          <CardTitle className="text-2xl">Marketplace</CardTitle>
          <CardDescription className="text-base">Próximamente</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-center text-sm text-muted-foreground">
          <p>Estamos preparando la plataforma de compra y venta entre usuarios.</p>
          <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-center">
            <Button variant="default" asChild>
              <Link href="/explore">Explorar otros servicios</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/become-pro">Registrarme como asociado</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
