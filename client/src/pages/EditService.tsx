import { useEffect, useMemo, useState } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useService,
  useUpdateService,
  useDeleteService,
  useCurrentProvider,
  useCategories,
  useMyServices,
  useCategoryVisibility,
  useSubcategories,
} from "@/hooks/use-mango-data";
import { useAuth } from "@/hooks/use-auth";
import { hasAdminRole } from "@/lib/auth-utils";
import {
  consumeEditServiceReturnPath,
  editServiceReturnLabel,
} from "@/lib/edit-service-return-path";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ArrowLeft, Sparkles, Tag, Trash2 } from "lucide-react";
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
import { getCategoryDisplayName, effectiveHiddenCategorySlugs } from "@shared/default-categories";
import { isCatalogAssignableServiceCategorySlug } from "@shared/catalog-service-categories";
import { createServiceRequiresSubcategory } from "@shared/create-service-catalog-context";
import {
  canChangeCatalogServiceCategory,
  canDeleteCatalogService,
  isPrimaryProviderCatalogService,
} from "@shared/provider-primary-catalog-service";
function buildEditServiceSchema(categories: { id: number; slug?: string }[]) {
  return z
    .object({
      categoryId: z.number().int().positive(),
      subcategoryId: z.number().int().positive().optional().nullable(),
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
      const slug = String(categories.find((c) => c.id === vals.categoryId)?.slug ?? "");
      if (createServiceRequiresSubcategory(slug)) {
        const subId = vals.subcategoryId != null ? Number(vals.subcategoryId) : NaN;
        if (!Number.isFinite(subId) || subId <= 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Selecciona una subcategoría.",
            path: ["subcategoryId"],
          });
        }
      }
      if (!isTradeListingCategorySlug(slug)) return;
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
  const [returnPath] = useState(() => consumeEditServiceReturnPath(`/service/${id}`));
  const returnLabel = editServiceReturnLabel(returnPath);
  const { data: service, isLoading: serviceLoading } = useService(id);
  const { data: provider, isLoading: providerLoading } = useCurrentProvider();
  const { user } = useAuth();
  const updateService = useUpdateService(id);
  const deleteService = useDeleteService();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const isAdmin = hasAdminRole(user);

  const isBlocked = false;

  const { data: categories = [] } = useCategories();
  const { data: myServices = [] } = useMyServices({ enabled: !!service && !!user });
  const { data: visibility } = useCategoryVisibility();
  const hiddenSlugs = useMemo(
    () => new Set(effectiveHiddenCategorySlugs(visibility?.hiddenSlugs)),
    [visibility]
  );

  const assignableCategories = useMemo(() => {
    return categories.filter((c) => {
      const slug = String((c as { slug?: string }).slug ?? "");
      return isCatalogAssignableServiceCategorySlug(slug) && !hiddenSlugs.has(slug);
    });
  }, [categories, hiddenSlugs]);

  const registrationCategoryId = provider ? Number((provider as { categoryId?: number }).categoryId) : undefined;

  const isPrimaryCatalogService = useMemo(() => {
    if (!service || !provider) return false;
    return isPrimaryProviderCatalogService(id, myServices, registrationCategoryId);
  }, [service, provider, id, myServices, registrationCategoryId]);

  const categoryChangeAllowed = isAdmin || (service && provider && canChangeCatalogServiceCategory(id, myServices, registrationCategoryId));

  const selectableCategoriesForService = useMemo(() => {
    if (!service) return [];
    if (isAdmin) return assignableCategories;
    if (isPrimaryCatalogService) {
      return assignableCategories.filter((c) => Number(c.id) === Number(service.categoryId));
    }
    const usedOthers = new Set(
      myServices.filter((s) => s.id !== service.id).map((s) => Number((s as { categoryId: number }).categoryId))
    );
    return assignableCategories.filter((c) => Number(c.id) === Number(service.categoryId) || !usedOthers.has(Number(c.id)));
  }, [assignableCategories, myServices, service, isAdmin, isPrimaryCatalogService]);

  const canDeleteThisService =
    !isAdmin && service && provider && canDeleteCatalogService(id, myServices, registrationCategoryId);

  const editServiceSchema = useMemo(() => buildEditServiceSchema(categories), [categories]);

  const form = useForm<EditServiceForm>({
    resolver: zodResolver(editServiceSchema),
    defaultValues: {
      categoryId: 0,
      subcategoryId: null,
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

  const watchedCategoryId = form.watch("categoryId");
  const activeCategorySlug = useMemo(() => {
    const cid = watchedCategoryId || (service as { categoryId?: number } | undefined)?.categoryId;
    const c = categories.find((x) => Number(x.id) === Number(cid));
    return String((c as { slug?: string } | undefined)?.slug ?? "");
  }, [watchedCategoryId, service, categories]);
  const isTrade = isTradeListingCategorySlug(activeCategorySlug);
  const isProfessional = isProfessionalListingCategorySlug(activeCategorySlug);
  const subcategoryRequired = createServiceRequiresSubcategory(activeCategorySlug);

  const { data: subcategories = [] } = useSubcategories(
    watchedCategoryId && watchedCategoryId > 0 ? watchedCategoryId : undefined
  );

  useEffect(() => {
    if (!service) return;
    const p = service.provider as {
      bio?: string;
      skills?: string[] | null;
      preparationLevel?: string | null;
      coursesCompleted?: string | null;
      certifications?: string | null;
    } | undefined;
    const svc = service as {
      listingBio?: string | null;
      listingSkills?: string[] | null;
      listingPreparationLevel?: string | null;
      listingCertifications?: string | null;
    };
    const bioFromListing = typeof svc.listingBio === "string" ? svc.listingBio : undefined;
    const skillsFromListing = Array.isArray(svc.listingSkills) ? [...svc.listingSkills] : undefined;
    const prepFromListing =
      typeof svc.listingPreparationLevel === "string" ? svc.listingPreparationLevel : undefined;
    const certsFromListing = typeof svc.listingCertifications === "string" ? svc.listingCertifications : undefined;

    form.reset({
      categoryId: Number((service as { categoryId: number }).categoryId),
      subcategoryId: (service as { subcategoryId?: number | null }).subcategoryId ?? null,
      title: service.title ?? "",
      description: service.description ?? "",
      price: String(service.price ?? "0"),
      imageUrl: service.imageUrl ?? "",
      professionalBio: bioFromListing ?? p?.bio ?? "",
      skills: skillsFromListing ?? (Array.isArray(p?.skills) ? [...p.skills] : []),
      preparationLevel: prepFromListing ?? resolvePreparationLevel(p),
      certifications: certsFromListing ?? resolveCertificationsText(p),
    });
  }, [service, form]);

  const isOwner = provider && service && service.providerId === provider.id;

  const handleSaveConfirmed = async () => {
    if (!service) return;
    const vals = form.getValues();
    const slug = String(categories.find((c) => c.id === vals.categoryId)?.slug ?? "");
    const trade = isTradeListingCategorySlug(slug);
    const professionalListing = isProfessionalListingCategorySlug(slug);
    try {
      await updateService.mutateAsync({
        title: vals.title,
        description: vals.description ?? "",
        price: vals.price,
        imageUrl: vals.imageUrl || undefined,
        categoryId: vals.categoryId,
        subcategoryId: vals.subcategoryId ?? null,
        listingBio: vals.professionalBio.trim(),
        listingSkills: vals.skills,
        ...(trade
          ? {
              listingPreparationLevel: (vals.preparationLevel ?? "").trim(),
              listingCertifications: (vals.certifications ?? "").trim(),
            }
          : {}),
        ...(!trade && professionalListing ? { listingCertifications: (vals.certifications ?? "").trim() } : {}),
      });
      setLocation(returnPath);
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
      <div className="container mx-auto max-w-md px-4 py-20 text-center">
        <p className="text-muted-foreground mb-4">Inicia sesión para editar servicios.</p>
        <Button asChild>
          <Link href="/login">Iniciar sesión</Link>
        </Button>
      </div>
    );
  }

  if (!isOwner && !hasAdminRole(user)) {
    return (
      <div className="container mx-auto max-w-md px-4 py-20 text-center">
        <p className="text-muted-foreground mb-4">Solo el dueño del servicio o un administrador puede editarlo.</p>
        <Button asChild variant="outline">
          <Link href={returnPath}>{returnLabel}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-2xl w-full px-4 py-12">
      <Button variant="ghost" className="mb-4 gap-2 -ml-2" asChild>
        <Link href={returnPath}>
          <ArrowLeft className="h-4 w-4" />
          {returnLabel}
        </Link>
      </Button>
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-display font-bold text-primary mb-2">Editar servicio</h1>
        <p className="text-muted-foreground">
          {isTrade
            ? "Actualiza título, descripción, preparación, certificaciones, habilidades y biografía. Todo queda guardado en esta ficha, sin pisar tus otras ofertas."
            : isProfessional
              ? "Actualiza título, descripción, certificaciones opcionales, habilidades y biografía de esta oferta. Cada servicio tiene su propia copia en el catálogo."
              : "Modifica los datos de esta publicación; la biografía y habilidades que guardes aquí son solo de este servicio."}
        </p>
      </div>

      <Card className="border-border/50 shadow-xl">
        <CardHeader>
          <CardTitle>Tu servicio y ficha pública</CardTitle>
          <CardDescription>
            {isTrade
              ? "Los cambios en preparación, certificaciones, habilidades y biografía se aplican solo a este servicio en el catálogo."
              : isProfessional
                ? "Certificaciones, habilidades y biografía se guardan en esta ficha; no modifican automáticamente otras ofertas que tengas."
                : "Los datos de perfil visibles en esta publicación son propios de este servicio cuando los guardas aquí."}
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
                name="categoryId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <Tag className="h-4 w-4 shrink-0" aria-hidden />
                      Categoría del servicio
                    </FormLabel>
                    <Select
                      onValueChange={(v) => {
                        field.onChange(Number(v));
                        form.setValue("subcategoryId", null);
                      }}
                      value={String(field.value)}
                      disabled={!categoryChangeAllowed || selectableCategoriesForService.length <= 1}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Categoría" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {selectableCategoriesForService.map((cat) => (
                          <SelectItem key={String(cat.id)} value={String(cat.id)}>
                            {getCategoryDisplayName(cat as any)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      {isPrimaryCatalogService
                        ? "Esta es tu ficha de registro: la categoría (Man Go o Pro Go) quedó fija al crear tu cuenta."
                        : "Puedes cambiar entre Man Go y Pro Go si aún no tienes otro servicio en esa categoría."}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {subcategories.length > 0 ? (
                <FormField
                  control={form.control}
                  name="subcategoryId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Subcategoría</FormLabel>
                      <Select
                        onValueChange={(v) => field.onChange(v && v !== "none" ? Number(v) : undefined)}
                        value={field.value != null ? String(field.value) : undefined}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona una subcategoría" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {!subcategoryRequired ? <SelectItem value="none">Ninguna</SelectItem> : null}
                          {subcategories.map((sub) => (
                            <SelectItem key={String(sub.id)} value={String(sub.id)}>
                              {sub.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : null}

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

              {canDeleteThisService ? (
                <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-3">
                  <p className="text-sm font-medium text-foreground">Eliminar este servicio adicional</p>
                  <p className="text-xs text-muted-foreground">
                    Solo puedes borrar servicios extra. Tu ficha principal de registro no se puede eliminar desde aquí.
                  </p>
                  <Button
                    type="button"
                    variant="destructive"
                    className="gap-2"
                    disabled={deleteService.isPending}
                    onClick={() => setDeleteOpen(true)}
                  >
                    {deleteService.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    Eliminar servicio
                  </Button>
                </div>
              ) : null}

              <Button
                type="submit"
                className="w-full text-lg h-12"
                disabled={updateService.isPending || isBlocked}
              >
                {updateService.isPending ? (
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

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este servicio?</AlertDialogTitle>
            <AlertDialogDescription>
              Se quitará del catálogo. Tu ficha principal de registro no se verá afectada. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                try {
                  await deleteService.mutateAsync(id);
                  setDeleteOpen(false);
                  setLocation("/my-services");
                } catch {
                  /* toast en el hook */
                }
              }}
            >
              Sí, eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
