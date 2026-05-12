import { GraduationCap, BadgeCheck } from "lucide-react";

export type ProviderCredentialSectionsProps = {
  /** Si es true, puede mostrarse el bloque de nivel de preparación (técnicos / mantenimiento). */
  showPreparationSection: boolean;
  preparationLevel: string;
  certifications: string;
};

/**
 * Secciones públicas de credenciales: preparación (oficios) y certificaciones (las tres categorías de catálogo).
 */
export function ProviderCredentialSections({
  showPreparationSection,
  preparationLevel,
  certifications,
}: ProviderCredentialSectionsProps) {
  const hasPrep = showPreparationSection && preparationLevel.trim().length > 0;
  const hasCerts = certifications.trim().length > 0;
  if (!hasPrep && !hasCerts) return null;

  return (
    <div className="space-y-8">
      {hasPrep ? (
        <section className="space-y-3" aria-labelledby="prep-level-heading">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 shrink-0 text-primary" aria-hidden />
            <h3 id="prep-level-heading" className="text-lg font-bold text-foreground">
              Nivel de preparación
            </h3>
          </div>
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-muted-foreground">{preparationLevel}</p>
        </section>
      ) : null}
      {hasCerts ? (
        <section className="space-y-3" aria-labelledby="prep-certs-heading">
          <div className="flex items-center gap-2">
            <BadgeCheck className="h-5 w-5 shrink-0 text-primary" aria-hidden />
            <h3 id="prep-certs-heading" className="text-lg font-bold text-foreground">
              Certificaciones obtenidas
            </h3>
          </div>
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-muted-foreground">{certifications}</p>
        </section>
      ) : null}
    </div>
  );
}
