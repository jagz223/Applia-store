import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, ArrowLeft, Home } from "lucide-react";

const MESSAGE =
  "Se notificó exitosamente a nuestro staff sobre tu solicitud; en breve podremos reflejar el monto en tu Saldo Genfeb.";

export default function RechargeConfirm() {
  return (
    <div className="container max-w-xl py-8 sm:py-16 px-4">
      <Card className="border-border bg-card shadow-sm text-center overflow-hidden">
        <CardHeader className="pb-2">
          <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Clock className="h-14 w-14 sm:h-16 sm:w-16" aria-hidden />
          </div>
          <CardTitle className="text-xl sm:text-2xl">Solicitud enviada</CardTitle>
          <CardDescription className="text-base mt-2 px-2">
            {MESSAGE}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <Button variant="outline" className="w-full sm:w-auto gap-2" asChild>
            <Link href="/recharge">
              <ArrowLeft className="h-4 w-4" />
              Volver a añadir saldo
            </Link>
          </Button>
          <Button className="w-full sm:w-auto gap-2" asChild>
            <Link href="/">
              <Home className="h-4 w-4" />
              Ir al inicio
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
