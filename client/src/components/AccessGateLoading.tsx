import { Loader2 } from "lucide-react";

type Props = {
  message?: string;
  className?: string;
};

/** Pantalla neutra mientras se valida sesión o se redirige al inicio. */
export function AccessGateLoading({ message = "Cargando…", className }: Props) {
  return (
    <div
      className={`flex min-h-[50vh] flex-col items-center justify-center gap-3 px-4 text-muted-foreground ${className ?? ""}`}
    >
      <Loader2 className="h-9 w-9 animate-spin text-primary" aria-hidden />
      <p className="text-sm">{message}</p>
    </div>
  );
}
