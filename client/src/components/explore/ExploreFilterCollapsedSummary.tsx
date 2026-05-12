import { motion } from "framer-motion";
import { Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";

export type ExploreFilterCollapsedSummaryProps = {
  /** Contenido de la línea de resumen (incluye prefijo «Vista guardada» si aplica). */
  children: ReactNode;
  onExpand: () => void;
};

/**
 * Barra compacta cuando el panel de filtros está plegado: resumen legible sin solapar el botón de expansión.
 */
export function ExploreFilterCollapsedSummary({ children, onExpand }: ExploreFilterCollapsedSummaryProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.33, 1, 0.68, 1] }}
      className="flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
    >
      <div className="min-w-0 sm:flex sm:min-h-10 sm:flex-1 sm:items-center">
        <p className="text-xs text-muted-foreground min-w-0 break-words sm:text-sm sm:leading-snug md:truncate md:whitespace-nowrap">
          {children}
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2 rounded-full shrink-0 self-start sm:self-auto"
        onClick={onExpand}
      >
        <Layers className="h-4 w-4" aria-hidden />
        Mostrar filtros
      </Button>
    </motion.div>
  );
}
