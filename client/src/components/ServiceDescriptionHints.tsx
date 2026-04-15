import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/** Texto del globo (tooltip): qué es la descripción del servicio frente a la biografía. */
export const SERVICE_DESCRIPTION_TOOLTIP =
  "La descripción del servicio detalla qué ofreces en esta publicación (alcance, qué incluye el precio, duración o entregables). La biografía habla de ti como profesional (trayectoria, enfoque, cómo trabajas). Son campos distintos: no repitas el mismo texto en ambos.";

/** Texto visible bajo la etiqueta (siempre legible, sin pasar el cursor). */
export const SERVICE_DESCRIPTION_INLINE_HINT =
  "Describe qué incluye este servicio concreto; no es lo mismo que tu biografía personal, más abajo.";

/** Globo junto a «Biografía» en el registro como proveedor. */
export const BIOGRAPHY_ONBOARDING_TOOLTIP =
  "Tu biografía habla de ti como profesional. La descripción del servicio (qué incluye la oferta) la puedes escribir en el campo de arriba; si lo dejas vacío, usamos este texto como descripción inicial hasta que lo edites en «Editar servicio».";

type InfoButtonProps = {
  ariaLabel?: string;
};

export function ServiceDescriptionInfoButton({ ariaLabel = "Información: descripción del servicio" }: InfoButtonProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={ariaLabel}
          >
            <Info className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          align="start"
          className="max-w-[min(100vw-2rem,22rem)] text-left text-sm leading-relaxed"
        >
          {SERVICE_DESCRIPTION_TOOLTIP}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function BiographyOnboardingInfoButton({ ariaLabel = "Información: biografía vs descripción del servicio" }: InfoButtonProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={ariaLabel}
          >
            <Info className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          align="start"
          className="max-w-[min(100vw-2rem,22rem)] text-left text-sm leading-relaxed"
        >
          {BIOGRAPHY_ONBOARDING_TOOLTIP}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
