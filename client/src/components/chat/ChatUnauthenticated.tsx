import { Link } from "wouter";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function ChatUnauthenticated() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="p-8 max-w-md text-center">
        <MessageSquare className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
        <h2 className="text-xl font-semibold mb-2">Inicia sesión para usar el chat</h2>
        <p className="text-muted-foreground text-sm mb-4">
          Necesitas estar autenticado para ver tus conversaciones y enviar mensajes.
        </p>
        <Button asChild>
          <Link href="/login">Iniciar sesión</Link>
        </Button>
      </Card>
    </div>
  );
}
