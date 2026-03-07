import { MessageSquare } from "lucide-react";

export function ChatEmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center min-h-[300px]">
      <div className="text-center">
        <MessageSquare className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-30" />
        <h3 className="text-lg font-medium mb-2">Selecciona una conversación</h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          Elige una conversación del panel lateral o inicia una nueva desde una reserva o servicio.
        </p>
      </div>
    </div>
  );
}
