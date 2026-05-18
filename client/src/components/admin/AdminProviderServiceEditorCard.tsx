import { Plus, Sparkles, Tag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSubcategories } from "@/hooks/use-mango-data";
import {
  SERVICE_DESCRIPTION_INLINE_HINT,
  ServiceDescriptionInfoButton,
} from "@/components/ServiceDescriptionHints";
import { CertificationsVisibilityHint } from "@/components/service/CertificationsVisibilityHint";
import {
  isProfessionalListingCategorySlug,
  isTradeListingCategorySlug,
} from "@shared/provider-preparation";

export type AdminProviderDetailService = {
  id: number;
  title: string;
  description: string;
  price: string;
  imageUrl: string;
  isActive: boolean;
  categoryId: number;
  categorySlug?: string | null;
  categoryDisplayName?: string | null;
  subcategoryId: number | null;
  subcategoryName?: string | null;
  listingBio: string | null;
  listingProfession: string | null;
  listingYearsExperience: number | null;
  listingSkills: string[];
  listingPreparationLevel: string | null;
  listingCertifications: string | null;
};

type CategoryOption = { id: number; slug: string; displayName: string };

function AdminProviderSkillsEditor({
  skills,
  disabled,
  onChange,
}: {
  skills: string[];
  disabled: boolean;
  onChange: (skills: string[]) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <Label>Habilidades</Label>
          <p className="text-xs text-muted-foreground mt-1 max-w-xl">
            Añade una por línea. Máximo 20, hasta 60 caracteres cada una.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="gap-1.5 rounded-full shrink-0"
          disabled={disabled || skills.length >= 20}
          onClick={() => onChange([...skills, ""])}
        >
          <Plus className="h-4 w-4" />
          Añadir
        </Button>
      </div>
      {skills.length === 0 ? (
        <p className="text-sm text-muted-foreground rounded-xl border border-dashed border-border/80 bg-muted/20 px-4 py-6 text-center">
          Pulsa <strong className="text-foreground">+ Añadir</strong> para escribir una habilidad.
        </p>
      ) : (
        <ul className="space-y-2">
          {skills.map((skill, index) => (
            <li key={index} className="flex gap-2 items-start">
              <Input
                placeholder={`Habilidad ${index + 1}`}
                maxLength={60}
                className="rounded-xl flex-1"
                value={skill}
                disabled={disabled}
                onChange={(e) => {
                  const next = [...skills];
                  next[index] = e.target.value;
                  onChange(next);
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 rounded-full text-muted-foreground hover:text-destructive"
                disabled={disabled}
                onClick={() => onChange(skills.filter((_, i) => i !== index))}
                aria-label={`Quitar habilidad ${index + 1}`}
              >
                <X className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Campos alineados con `EditService.tsx` (sin precio ni URL de imagen en UI). */
export function AdminProviderServiceEditorCard({
  service,
  categories,
  onChange,
  disabled,
}: {
  service: AdminProviderDetailService;
  categories: CategoryOption[];
  onChange: (patch: Partial<AdminProviderDetailService>) => void;
  disabled: boolean;
}) {
  const { data: subs = [] } = useSubcategories(service.categoryId || undefined);
  const categorySlug =
    service.categorySlug ?? categories.find((c) => c.id === service.categoryId)?.slug ?? "";
  const isTrade = isTradeListingCategorySlug(categorySlug);
  const isProfessional = isProfessionalListingCategorySlug(categorySlug);
  const bioLen = (service.listingBio ?? "").length;

  return (
    <div className="rounded-xl border border-border/50 bg-card shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-muted/30 px-4 py-3">
        <p className="font-semibold text-sm">
          Ficha #{service.id}
          {service.categoryDisplayName ? (
            <span className="ml-2 font-normal text-muted-foreground">· {service.categoryDisplayName}</span>
          ) : null}
        </p>
        <div className="flex items-center gap-2">
          <Label htmlFor={`svc-active-${service.id}`} className="text-xs text-muted-foreground">
            Visible en catálogo
          </Label>
          <Switch
            id={`svc-active-${service.id}`}
            checked={service.isActive}
            disabled={disabled}
            onCheckedChange={(v) => onChange({ isActive: v })}
          />
        </div>
      </div>

      <div className="space-y-6 p-4 sm:p-5">
        {isProfessional ? (
          <div className="rounded-lg border border-primary/25 bg-primary/5 p-4 text-sm">
            <div className="flex gap-2">
              <Sparkles className="h-4 w-4 shrink-0 text-primary mt-0.5" aria-hidden />
              <div>
                <p className="font-medium text-foreground">Título de la oferta</p>
                <p className="mt-1 text-muted-foreground">
                  El nombre del servicio es el título público en el catálogo junto al asociado.
                </p>
              </div>
            </div>
          </div>
        ) : null}

        <div className="space-y-1.5">
          <Label>Nombre del servicio</Label>
          <p className="text-xs text-muted-foreground">Título público de la oferta en el buscador.</p>
          <Input
            placeholder="Ej: Limpieza completa de hogar"
            value={service.title}
            disabled={disabled}
            onChange={(e) => onChange({ title: e.target.value })}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="flex items-center gap-2">
            <Tag className="h-4 w-4 shrink-0" aria-hidden />
            Categoría del servicio
          </Label>
          <Select
            value={String(service.categoryId)}
            disabled={disabled}
            onValueChange={(v) => {
              const nextId = Number(v);
              const nextCat = categories.find((c) => c.id === nextId);
              onChange({
                categoryId: nextId,
                subcategoryId: null,
                categorySlug: nextCat?.slug ?? null,
                categoryDisplayName: nextCat?.displayName ?? null,
              });
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {subs.length > 0 ? (
          <div className="space-y-1.5">
            <Label>Subcategoría</Label>
            <Select
              value={service.subcategoryId != null ? String(service.subcategoryId) : "none"}
              disabled={disabled}
              onValueChange={(v) => onChange({ subcategoryId: v === "none" ? null : Number(v) })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecciona una subcategoría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Ninguna</SelectItem>
                {subs.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Label className="mb-0">Descripción del servicio</Label>
            <ServiceDescriptionInfoButton />
          </div>
          <p className="text-xs text-muted-foreground">{SERVICE_DESCRIPTION_INLINE_HINT}</p>
          <Textarea
            placeholder="Qué incluye este servicio..."
            className="min-h-[120px]"
            value={service.description}
            disabled={disabled}
            onChange={(e) => onChange({ description: e.target.value })}
          />
        </div>

        {isTrade ? (
          <>
            <div className="space-y-1.5">
              <Label>Nivel de preparación</Label>
              <p className="text-xs text-muted-foreground">
                Escolaridad o nivel formal y formación complementaria: cursos, talleres o programas.
              </p>
              <Textarea
                placeholder="Ej. Bachillerato completo; curso de redes Cisco; taller de soldadura industrial…"
                className="min-h-[120px] resize-y"
                value={service.listingPreparationLevel ?? ""}
                disabled={disabled}
                onChange={(e) => onChange({ listingPreparationLevel: e.target.value || null })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Certificaciones obtenidas (opcional)</Label>
              <p className="text-xs text-muted-foreground">
                Si lo completas, tendrá su propia sección en la ficha pública del servicio.
              </p>
              <CertificationsVisibilityHint />
              <Textarea
                placeholder="Ej. Certificado EPA sección 608; carné habilitado; maestría en…"
                className="min-h-[120px] resize-y mt-2"
                value={service.listingCertifications ?? ""}
                disabled={disabled}
                onChange={(e) => onChange({ listingCertifications: e.target.value || null })}
              />
            </div>
          </>
        ) : null}

        {isProfessional && !isTrade ? (
          <div className="space-y-1.5">
            <Label>Certificaciones obtenidas (opcional)</Label>
            <p className="text-xs text-muted-foreground">
              Maestrías, doctorados, registro profesional, títulos o certificaciones para la ficha.
            </p>
            <CertificationsVisibilityHint />
            <Textarea
              placeholder="Ej. Doctorado en Derecho; registro contador; certificación internacional…"
              className="min-h-[120px] resize-y mt-2"
              value={service.listingCertifications ?? ""}
              disabled={disabled}
              onChange={(e) => onChange({ listingCertifications: e.target.value || null })}
            />
          </div>
        ) : null}

        <AdminProviderSkillsEditor
          skills={service.listingSkills ?? []}
          disabled={disabled}
          onChange={(listingSkills) => onChange({ listingSkills })}
        />

        <div className="space-y-1.5">
          <Label>Biografía y enfoque profesional</Label>
          <Textarea
            placeholder="Quién eres, tu especialidad, cómo trabajas y qué pueden esperar los clientes. Entre 50 y 700 caracteres."
            className="min-h-[140px] resize-y"
            maxLength={700}
            value={service.listingBio ?? ""}
            disabled={disabled}
            onChange={(e) => onChange({ listingBio: e.target.value || null })}
          />
          <p className="text-xs text-muted-foreground flex justify-between gap-2">
            <span>Obligatorio en catálogo: mínimo 50 caracteres, máximo 700.</span>
            <span className="tabular-nums shrink-0">{bioLen}/700</span>
          </p>
        </div>
      </div>
    </div>
  );
}
