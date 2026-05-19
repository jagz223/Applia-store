import * as React from "react";
import { cn } from "@/lib/utils";

export type ModalPortalShellProps = {
  /** Clase z-index del shell (p. ej. MODAL_Z_DIALOG_SHELL). */
  zIndexClass: string;
  /** Overlay Radix (absolute inset-0), renderizado detrás del contenido. */
  overlay: React.ReactNode;
  children: React.ReactNode;
  /** Centrar contenido (Dialog / Alert). Desactivar para Sheet lateral. */
  centerContent?: boolean;
  className?: string;
};

/**
 * Shell único para portales Radix: garantiza que el backdrop no tape el contenido.
 * - Shell: fixed + z-index alto
 * - Overlay: absolute inset-0 (hermano anterior)
 * - Contenido: relative z-10 (hermano posterior)
 */
export function ModalPortalShell({
  zIndexClass,
  overlay,
  children,
  centerContent = true,
  className,
}: ModalPortalShellProps) {
  return (
    <div
      className={cn(
        "fixed inset-0",
        zIndexClass,
        centerContent && "flex items-center justify-center p-4",
        className,
      )}
    >
      {overlay}
      {children}
    </div>
  );
}
