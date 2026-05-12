import { useEffect, useMemo, useState } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useService, useUpdateService, useCurrentProvider, useUpdateProvider } from "@/hooks/use-mango-data";
import { useAuth } from "@/hooks/use-auth";
import { hasAdminRole } from "@/lib/auth-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, ArrowLeft, Sparkles } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { professionalBioFieldSchema } from "@shared/schema";
import { providerSkillsSchema } from "@shared/skills-schema";
import { ProviderSkillsField } from "@/components/ProviderSkillsField";
import {
  SERVICE_DESCRIPTION_INLINE_HINT,
  ServiceDescriptionInfoButton,
} from "@/components/ServiceDescriptionHints";
import { CertificationsVisibilityHint } from "@/components/service/CertificationsVisibilityHint";
import {
  isProfessionalListingCategorySlug,
  isTradeListingCategorySlug,
  resolveCertificationsText,
  resolvePreparationLevel,
} from "@shared/provider-preparation";

function buildEditServiceSchema(isTrade: boolean) {
  return z
    .object({
      title: z.string().min(1, "El nombre es obligatorio").max(500),
      description: z.string().max(5000).optional(),
      price: z.string().min(1, "El precio es obligatorio"),
      imageUrl: z.string().url("URL no válida").optional().or(z.literal("")),
      professionalBio: professionalBioFieldSchema,
      skills: providerSkillsSchema,
      preparationLevel: z.string().optional(),
      certifications: z.string().optional(),
    })
    .superRefine((vals, ctx) => {
      if (!isTrade) return;
      const p = (vals.preparationLevel ?? "").trim();
      if (p.length < 10) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Describe tu nivel de preparación (escolaridad, cursos, talleres). Mínimo 10 caracteres.",
          path: ["preparationLevel"],
        });
      }
    });
}

type EditServiceForm = z.infer<ReturnType<typeof buildEditServiceSchema>>;

export default function EditService() {
  const [, params] = useRoute("/edit-service/:id");
  const [, setLocation] = useLocation();
  const id = parseInt(params?.id || "0", 10);
  const { data: service, isLoading: serviceLoading } = useService(id);
  const { data: provider, isLoading: providerLoading } = useCurrentProvider();
  const { user } = useAuth();
  const updateService = useUpdateService(id);
  const updateProvider = useUpdateProvider();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isAdmin = hasAdminRole(user);

  const isBlocked = false;

  const categorySlug = useMemo(
    () => String((service?.category as { slug?: string } | undefined)?.slug ?? ""),
    [service?.category]
  );
  const isTrade = isTradeListingCategorySlug(categorySlug);
  const isProfessional = isProfessionalListingCategorySlug(categorySlug);

  const editServiceSchema = useMemo(() => buildEditServiceSchema(isTrade), [isTrade]);

  const form = useForm<EditServiceForm>({
    resolver: zodResolver(editServiceSchema),
    defaultValues: {
      title: "",
      description: "",
      price: "0",
      imageUrl: "",
      professionalBio: "",
      skills: [] as string[],
      preparationLevel: "",
      certifications: "",
    },
  });

  useEffect(() => {
    if (!service) return;
    const p = service.provider as {
      bio?: string;
      skills?: string[] | null;
      preparationLevel?: string | null;
      coursesCompleted?: string | null;
      certifications?: string | null;
    } | undefined;
    form.reset({
      title: service.title ?? "",
      description: service.description ?? "",
      price: String(service.price ?? "0"),
      imageUrl: service.imageUrl ?? "",
      professionalBio: p?.bio ?? "",
      skills: Array.isArray(p?.skills) ? [...p.skills] : [],
      preparationLevel: resolvePreparationLevel(p),
      certifications: resolveCertificationsText(p),
    });
  }, [service, form]);

  const isOwner = provider && service && service.providerId === provider.id;

  const handleSaveConfirmed = async () => {
    const vals = form.getValues();
    const providerId = service?.provider && "id" in service.provider ? (service.provider as { id: number }).id : undefined;
    if (providerId == null) return;
    try {
      await updateProvider.mutateAsync({
        providerId,
        data: {
          bio: vals.professionalBio.trim(),
          skills: vals.skills,
          ...(isTrade
            ? {
                preparationLevel: (vals.preparationLevel ?? "").trim(),
                certifications: (vals.certifications ?? "").trim(),
              }
            : {}),
          ...(!isTrade && isProfessional ? { certifications: (vals.certifications ?? "").trim() } : {}),
        },
      });
      await updateService.mutateAsync({
        title: vals.title,
        description: vals.description ?? "",
        price: vals.price,
        imageUrl: vals.imageUrl || undefined,
      });
      setLocation(`/service/${id}`);
    } catch {
      // Toasts desde mutaciones
    }
  };

  const onSubmit = () => {
    if (isAdmin) {
      handleSaveConfirmed();
    } else {
      setConfirmOpen(true);
    }
  };

  if (serviceLoading || providerLoading || !service) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container max-w-md py-20 text-center">
        <p className="text-muted-foreground mb-4">Inicia sesión para editar servicios.</p>
        <Button asChild>
          <Link href="/login">Iniciar sesión</Link>
        </Button>
      </div>
    );
  }

  if (!isOwner && !hasAdminRole(user)) {
    return (
      <div className="container max-w-md py-20 text-center">
        <p className="text-muted-foreground mb-4">Solo el dueño del servicio o un administrador puede editarlo.</p>
        <Button asChild variant="outline">
          <Link href={`/service/${id}`}>Volver al servicio</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="container max-w-2xl py-12 px-4">
      <Button variant="ghost" className="mb-4 gap-2 -ml-2" asChild>
        <Link href={`/service/${id}`}>
          <ArrowLeft className="h-4 w-4" />
          Volver al servicio
        </Link>
      </Button>
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-display font-bold text-primary mb-2">Editar servicio</h1>
        <p className="text-muted-foreground">
          {isTrade
            ? "Actualiza tu publicación: título, descripción, nivel de preparación, certificaciones, habilidades y biografía."
            : isProfessional
              ? "Actualiza título, descripción, certificados opcionales, habilidades y biografía. Lo que escribas en certificaciones se verá en la ficha pública si no está vacío."
              : "Modifica tu publicación: datos del servicio y tu biografía profesional (50–700 caracteres)."}
        </p>
      </div>

      <Card className="border-border/50 shadow-xl">
        <CardHeader>
          <CardTitle>Tu servicio y perfil</CardTitle>
          <CardDescription>
            {isTrade
              ? "En Servicios técnicos y Mantenimiento el catálogo muestra también tu nivel de preparación y, si las indicas, tus certificaciones."
              : isProfessional
                ? "En Servicios profesionales puedes publicar certificaciones y títulos (maestría, doctorado, etc.); aparecen en la ficha del servicio solo si el campo no está vacío."
                : "Mismo formulario que al registrarte como proveedor: nombre, descripción, habilidades y biografía pública."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {isProfessional ? (
                <div className="rounded-lg border border-primary/25 bg-primary/5 p-4 text-sm">
                  <div className="flex gap-2">
                    <Sparkles className="h-4 w-4 shrink-0 text-primary mt-0.5" aria-hidden />
                    <div>
                      <p className="font-medium text-foreground">Título de la oferta</p>
                      <p className="mt-1 text-muted-foreground">
                        El campo «Nombre del servicio» es el título público que verán los clientes en el catálogo junto a tu
                        nombre. Asegúrate de que describa claramente tu oferta.
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre del servicio</FormLabel>
                    <FormDescription>
                      Título público de tu oferta en el buscador (lo definiste al registrarte como asociado o aquí). Tu nombre
                      como persona sigue mostrándose en el perfil; este campo describe qué ofreces y cómo quieres titular el
                      servicio.
                    </FormDescription>
                    <FormControl>
                      <Input placeholder="Ej: Limpieza completa de hogar" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="price"
                render={({ field }) => <input type="hidden" {...field} />}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center gap-2">
                      <FormLabel className="mb-0">Descripción del servicio</FormLabel>
                      <ServiceDescriptionInfoButton />
                    </div>
                    <FormDescription>{SERVICE_DESCRIPTION_INLINE_HINT}</FormDescription>
                    <FormControl>
                      <Textarea placeholder="Qué incluye este servicio..." className="min-h-[120px]" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {isTrade ? (
                <>
                  <FormField
                    control={form.control}
                    name="preparationLevel"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nivel de preparación</FormLabel>
                        <FormDescription className="text-xs">
                          Escolaridad o nivel formal (ej. primaria, bachillerato, técnico, universitario) y formación
                          complementaria: cursos, talleres o programas.
                        </FormDescription>
                        <FormControl>
                          <Textarea
                            placeholder="Ej. Bachillerato completo; curso de redes Cisco; taller de soldadura industrial…"
                            className="min-h-[120px] resize-y"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="certifications"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Certificaciones obtenidas (opcional)</FormLabel>
                        <FormDescription className="text-xs">
                          Si lo completas, tendrá su propia sección en la ficha pública del servicio.
                        </FormDescription>
                        <CertificationsVisibilityHint />
                        <FormControl>
                          <Textarea
                            placeholder="Ej. Certificado EPA sección 608; carné habilitado; maestría en…"
                            className="min-h-[120px] resize-y mt-2"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              ) : null}

              {isProfessional && !isTrade ? (
                <FormField
                  control={form.control}
                  name="certifications"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Certificaciones obtenidas (opcional)</FormLabel>
                      <FormDescription className="text-xs">
                        Maestrías, doctorados, registro profesional, títulos o certificaciones que quieras mostrar en tu ficha.
                      </FormDescription>
                      <CertificationsVisibilityHint />
                      <FormControl>
                        <Textarea
                          placeholder="Ej. Doctorado en Derecho; registro contador; certificación internacional…"
                          className="min-h-[120px] resize-y mt-2"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : null}

              <ProviderSkillsField control={form.control} name="skills" />

              <FormField
                control={form.control}
                name="professionalBio"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Biografía y enfoque profesional</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Quién eres, tu especialidad, cómo trabajas y qué pueden esperar los clientes. Entre 50 y 700 caracteres."
                        className="min-h-[140px] resize-y"
                        maxLength={700}
                        {...field}
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground flex justify-between gap-2">
                      <span>Obligatorio: mínimo 50 caracteres, máximo 700.</span>
                      <span className="tabular-nums shrink-0">{field.value?.length ?? 0}/700</span>
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full text-lg h-12"
                disabled={updateService.isPending || updateProvider.isPending || isBlocked}
              >
                {updateService.isPending || updateProvider.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  "Guardar cambios"
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Guardar los cambios?</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás completamente seguro de que tu texto es correcto? Revisa cuidadosamente antes de continuar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver a revisar</AlertDialogCancel>
            <AlertDialogAction onClick={handleSaveConfirmed} className="bg-primary text-primary-foreground hover:bg-primary/90">
              Sí, guardar cambios
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
