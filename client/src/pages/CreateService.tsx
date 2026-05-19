import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  useCreateService,
  useCurrentProvider,
  useCategories,
  useSubcategories,
  useMyServices,
  useCategoryVisibility,
} from "@/hooks/use-mango-data";
import { useAuth } from "@/hooks/use-auth";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Sparkles, ArrowLeft } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { getCategoryDisplayName, effectiveHiddenCategorySlugs } from "@shared/default-categories";
import { isCatalogAssignableServiceCategorySlug } from "@shared/catalog-service-categories";
import {
  SERVICE_DESCRIPTION_INLINE_HINT,
  ServiceDescriptionInfoButton,
  BiographyOnboardingInfoButton,
} from "@/components/ServiceDescriptionHints";
import { CertificationsVisibilityHint } from "@/components/service/CertificationsVisibilityHint";
import { ProviderSkillsField } from "@/components/ProviderSkillsField";
import {
  createServiceCategorySlug,
  createServiceIsFocusCatalogSlug,
  createServiceRequiresSubcategory,
  getCreateServiceCategoryIntro,
  getCreateServiceFormPlaceholders,
  isProfessionalListingCategorySlug,
  isTradeListingCategorySlug,
} from "@shared/create-service-catalog-context";
import { buildCreateServiceFormSchema, type CreateServiceFormValues } from "@shared/create-service-form-schema";
import { buildServiceListingProfileFromCreateForm } from "@shared/service-listing-profile";
import {
  CATALOG_FOCUS_BIO_DESCRIPTION,
  CATALOG_FOCUS_CERTIFICATIONS_PROFESSIONAL_DESCRIPTION,
  CATALOG_FOCUS_CERTIFICATIONS_TRADE_DESCRIPTION,
  CATALOG_FOCUS_PREPARATION_LEVEL_DESCRIPTION,
  CATALOG_FOCUS_SERVICE_DESCRIPTION_OPTIONAL_NOTE,
  CATALOG_FOCUS_SERVICE_TITLE_DESCRIPTION,
  catalogFocusSubcategoryFormDescription,
  CATALOG_CREATE_SERVICE_ISOLATION_NOTE,
} from "@shared/catalog-focus-form-copy";
import type { InsertService } from "@shared/schema";

export default function CreateService() {
  const { user, isLoading: authLoading } = useAuth();
  const { data: providerFromApi, isLoading: providerApiLoading } = useCurrentProvider();
  const provider = user?.provider ?? providerFromApi ?? null;
  const { data: categories } = useCategories();
  const categoriesRef = useRef(categories ?? []);
  categoriesRef.current = categories ?? [];

  const createServiceFormSchema = useMemo(
    () => buildCreateServiceFormSchema(() => categoriesRef.current),
    [],
  );

  const { data: visibility } = useCategoryVisibility();
  const hiddenSlugs = useMemo(
    () => new Set(effectiveHiddenCategorySlugs(visibility?.hiddenSlugs)),
    [visibility],
  );
  const shouldFetchMyServices =
    !!user &&
    (!!provider || !!(user as { provider?: unknown }).provider || (user as { role?: string }).role === "professional");
  const { data: myServices = [] } = useMyServices({ enabled: shouldFetchMyServices && !authLoading });
  const createService = useCreateService();
  const [, setLocation] = useLocation();

  const form = useForm<CreateServiceFormValues>({
    resolver: zodResolver(createServiceFormSchema),
    defaultValues: {
      providerId: 0,
      categoryId: 0,
      subcategoryId: undefined,
      title: "",
      description: "",
      price: "0",
      imageUrl: "",
      isActive: true,
      preparationLevel: "",
      certifications: "",
      yearsExperience: 0,
      skills: [],
      profession: "",
      bio: "",
    },
  });

  const providerCategoryId = (provider as { categoryId?: number })?.categoryId ?? null;
  const providerCategorySlug = (provider as { category?: string })?.category ?? null;
  const providerCategory = useMemo(() => {
    if (providerCategoryId != null && !Number.isNaN(providerCategoryId)) {
      return categories?.find((c) => c.id === providerCategoryId) ?? null;
    }
    if (providerCategorySlug && categories?.length) {
      return categories.find((c) => (c as { slug?: string }).slug === providerCategorySlug) ?? null;
    }
    return null;
  }, [categories, providerCategoryId, providerCategorySlug]);

  const resolvedProviderCategoryId = providerCategory?.id ?? providerCategoryId;

  const assignableCategories = useMemo(() => {
    return (categories ?? []).filter((c) => {
      const slug = String((c as { slug?: string }).slug ?? "");
      return isCatalogAssignableServiceCategorySlug(slug) && !hiddenSlugs.has(slug);
    });
  }, [categories, hiddenSlugs]);

  /** Subcategorías ya usadas por categoría (Man Go / Pro Go permiten varias fichas, una por subcategoría). */
  const usedSubcategoryIdsByCategory = useMemo(() => {
    const m = new Map<number, Set<number>>();
    for (const s of myServices) {
      const cid = Number((s as { categoryId: number }).categoryId);
      const sid = Number((s as { subcategoryId?: number | null }).subcategoryId);
      if (!Number.isFinite(cid) || !Number.isFinite(sid)) continue;
      if (!m.has(cid)) m.set(cid, new Set());
      m.get(cid)!.add(sid);
    }
    return m;
  }, [myServices]);

  const availableCategories = useMemo(() => assignableCategories, [assignableCategories]);

  const defaultCategoryId = useMemo(() => {
    if (availableCategories.length === 0) return null;
    const prefer = resolvedProviderCategoryId != null ? Number(resolvedProviderCategoryId) : NaN;
    const match = availableCategories.find((c) => Number(c.id) === prefer);
    return match ? Number(match.id) : Number(availableCategories[0].id);
  }, [availableCategories, resolvedProviderCategoryId]);

  const categoryIdValue = form.watch("categoryId");
  const selectedSlug = useMemo(
    () => createServiceCategorySlug(categoryIdValue, categories ?? []),
    [categoryIdValue, categories],
  );
  const isFocusCatalog = createServiceIsFocusCatalogSlug(selectedSlug);
  const isTrade = isTradeListingCategorySlug(selectedSlug);
  const isProfessional = isProfessionalListingCategorySlug(selectedSlug);
  const needsSubcategory = createServiceRequiresSubcategory(selectedSlug);
  const categoryIntro = getCreateServiceCategoryIntro(selectedSlug);
  const placeholders = useMemo(() => getCreateServiceFormPlaceholders(selectedSlug), [selectedSlug]);
  const descriptionWatch = form.watch("description");
  const descriptionLength = descriptionWatch?.length ?? 0;

  const { data: subcategories = [] } = useSubcategories(
    categoryIdValue != null && categoryIdValue > 0 ? categoryIdValue : undefined,
  );

  const selectableSubcategories = useMemo(() => {
    if (!categoryIdValue || categoryIdValue <= 0) return subcategories;
    const used = usedSubcategoryIdsByCategory.get(Number(categoryIdValue));
    if (!used?.size) return subcategories;
    return subcategories.filter((sub) => !used.has(Number(sub.id)));
  }, [subcategories, categoryIdValue, usedSubcategoryIdsByCategory]);

  useEffect(() => {
    if (provider) {
      form.setValue("providerId", provider.id);
    }
  }, [provider, form]);

  useEffect(() => {
    if (defaultCategoryId != null && !Number.isNaN(defaultCategoryId)) {
      form.setValue("categoryId", defaultCategoryId);
    }
  }, [defaultCategoryId, form]);

  useEffect(() => {
    form.setValue("subcategoryId", undefined);
  }, [categoryIdValue, form]);

  useEffect(() => {
    if (isTrade) form.setValue("profession", "");
  }, [isTrade, form]);

  if (authLoading || (user?.role === "professional" && !user?.provider && providerApiLoading)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container mx-auto max-w-md px-4 py-20 text-center">
        <p className="text-muted-foreground mb-4">Inicia sesión para crear servicios.</p>
        <Button asChild>
          <Link href="/login">Iniciar sesión</Link>
        </Button>
      </div>
    );
  }

  if (!provider) {
    const isProfessional = user.role === "professional";
    return (
      <div className="container mx-auto max-w-md px-4 py-20 text-center">
        <p className="text-muted-foreground mb-4">
          {isProfessional
            ? "Completa tu perfil de asociado para poder crear servicios."
            : "Debes ser asociado para crear servicios."}
        </p>
        <Button asChild>
          <Link href="/become-pro">Convertirse en asociado</Link>
        </Button>
      </div>
    );
  }

  async function onSubmit(data: CreateServiceFormValues) {
    if (!provider) return;

    const slug = createServiceCategorySlug(data.categoryId, categories ?? []);
    const listing = buildServiceListingProfileFromCreateForm(slug, {
      yearsExperience: data.yearsExperience,
      skills: data.skills ?? [],
      profession: data.profession,
      bio: data.bio,
      preparationLevel: data.preparationLevel,
      certifications: data.certifications,
    });

    const servicePayload = {
      providerId: data.providerId,
      categoryId: data.categoryId,
      subcategoryId: data.subcategoryId ?? undefined,
      title: data.title.trim(),
      description: data.description.trim(),
      price: "0",
      imageUrl: "",
      isActive: data.isActive ?? true,
      ...listing,
    } as InsertService & { subcategoryId?: number } & typeof listing;

    try {
      await createService.mutateAsync(servicePayload as InsertService);
    } catch {
      return;
    }

    setLocation("/my-services");
  }

  if (assignableCategories.length === 0) {
    return (
      <div className="container mx-auto max-w-2xl w-full px-4 py-12">
        <Card>
          <CardHeader>
            <CardTitle>No hay categorías de catálogo activas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-muted-foreground">
            <p>No hay categorías Man Go o Pro Go habilitadas en la plataforma en este momento.</p>
            <Button variant="outline" asChild>
              <Link href="/my-services">Volver a Mis servicios</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const subcategoryRequired = needsSubcategory && selectableSubcategories.length > 0;
  const allSubsTakenForCategory =
    needsSubcategory && subcategories.length > 0 && selectableSubcategories.length === 0;
  const submitPending = createService.isPending;

  return (
    <div className="container mx-auto max-w-2xl w-full px-4 py-12">
      <Button variant="ghost" className="mb-4 gap-2 -ml-2" asChild>
        <Link href="/my-services">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Volver a Mis servicios
        </Link>
      </Button>

      <div className="mb-8 text-center">
        <h1 className="text-3xl font-display font-bold text-primary mb-2">Nuevo servicio de catálogo</h1>
        <p className="text-muted-foreground">
          Puedes publicar <strong className="text-foreground">varias fichas en Man Go o Pro Go</strong>, una por
          especialidad (subcategoría distinta). Cada ficha es independiente: título, descripción y datos del oficio. No se
          reutiliza tu servicio de reparación de PC si ahora ofreces plomería.
        </p>
        <div className="mt-6 rounded-xl border border-border/60 bg-muted/30 p-4 text-left text-sm text-muted-foreground max-w-xl mx-auto">
          {CATALOG_CREATE_SERVICE_ISOLATION_NOTE}
        </div>
      </div>

      <Card className="border-border/50 shadow-xl">
        <CardHeader>
          <CardTitle>Perfil de asociado</CardTitle>
          <CardDescription>
            Indica categoría y datos de esta oferta. Lo que escribas aquí aplica solo a este servicio y no modifica lo que
            ya tenías en otras categorías u ofertas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="categoryId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Categoría del servicio</FormLabel>
                    <Select
                      onValueChange={(v) => field.onChange(Number(v))}
                      value={String(field.value)}
                      disabled={availableCategories.length <= 1}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona categoría" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {availableCategories.map((cat) => (
                          <SelectItem key={String(cat.id)} value={String(cat.id)}>
                            {getCategoryDisplayName(cat as never)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Puedes elegir Man Go o Pro Go. En la misma categoría, agrega otra ficha solo si eliges una{" "}
                      <strong className="text-foreground">subcategoría distinta</strong> (p. ej. plomería si ya publicaste
                      computación). Cada ficha tiene formulario propio.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {selectableSubcategories.length > 0 ? (
                <FormField
                  control={form.control}
                  name="subcategoryId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{needsSubcategory ? "Subcategoría" : "Subcategoría (opcional)"}</FormLabel>
                      <FormDescription className="text-xs">
                        {catalogFocusSubcategoryFormDescription(needsSubcategory)}
                      </FormDescription>
                      <Select
                        onValueChange={(v) => field.onChange(!v || v === "none" ? undefined : Number(v))}
                        value={
                          field.value != null && Number(field.value) > 0
                            ? String(field.value)
                            : subcategoryRequired
                              ? undefined
                              : "none"
                        }
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue
                              placeholder={
                                subcategoryRequired ? "Selecciona una subcategoría" : "Selecciona una subcategoría"
                              }
                            />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {!subcategoryRequired ? <SelectItem value="none">Ninguna</SelectItem> : null}
                          {selectableSubcategories.map((sub) => (
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
              ) : allSubsTakenForCategory ? (
                <p className="text-sm text-amber-600 dark:text-amber-500">
                  Ya tienes un servicio publicado en cada subcategoría de esta categoría. Elige otra categoría (p. ej. Pro
                  Go si solo usaste Man Go) o edita una ficha existente en Mis servicios.
                </p>
              ) : needsSubcategory ? (
                <p className="text-sm text-amber-600 dark:text-amber-500">
                  No hay subcategorías cargadas para esta categoría. Si el problema continúa, contacta soporte; no podrás
                  publicar sin elegir subcategoría.
                </p>
              ) : null}

              {isFocusCatalog && categoryIntro ? (
                <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                  <p className="text-sm font-semibold text-foreground">Guía rápida</p>
                  <p className="text-sm text-muted-foreground mt-1">{categoryIntro}</p>
                </div>
              ) : null}

              {isTrade ? (
                <>
                  <FormField
                    control={form.control}
                    name="preparationLevel"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nivel de preparación</FormLabel>
                        <FormDescription className="text-xs">{CATALOG_FOCUS_PREPARATION_LEVEL_DESCRIPTION}</FormDescription>
                        <FormControl>
                          <Textarea
                            placeholder="Ej. Bachillerato completo; curso de instalaciones sanitarias IPAC 2023; taller de refrigeración doméstica…"
                            className="min-h-[100px] resize-y"
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
                        <FormDescription className="text-xs">{CATALOG_FOCUS_CERTIFICATIONS_TRADE_DESCRIPTION}</FormDescription>
                        <CertificationsVisibilityHint />
                        <FormControl>
                          <Textarea
                            placeholder="Ej. Certificado EPA sección 608; carné de electricista habilitado; PhD en…"
                            className="min-h-[100px] resize-y mt-2"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="yearsExperience"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Años de experiencia</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 0)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              ) : null}

              {isFocusCatalog ? (
                <>
                  {isProfessional ? (
                    <div className="rounded-lg border border-primary/25 bg-primary/5 p-4 text-sm">
                      <div className="flex gap-2">
                        <Sparkles className="h-4 w-4 shrink-0 text-primary mt-0.5" aria-hidden />
                        <div>
                          <p className="font-medium text-foreground">Título de la oferta</p>
                          <p className="mt-1 text-muted-foreground">
                            El campo «Nombre del servicio» es el título público que verán los clientes en el catálogo junto a
                            tu nombre. Asegúrate de que describa claramente esta oferta.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {isProfessional ? (
                    <FormField
                      control={form.control}
                      name="profession"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Profesión / Título</FormLabel>
                          <FormControl>
                            <Input placeholder={placeholders.profession} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ) : null}

                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nombre del servicio</FormLabel>
                        <FormDescription>{CATALOG_FOCUS_SERVICE_TITLE_DESCRIPTION}</FormDescription>
                        <FormControl>
                          <Input placeholder={placeholders.serviceTitle} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center gap-2">
                          <FormLabel className="mb-0">Descripción del servicio</FormLabel>
                          <ServiceDescriptionInfoButton ariaLabel="Información: descripción del servicio" />
                        </div>
                        <FormDescription>{SERVICE_DESCRIPTION_INLINE_HINT}</FormDescription>
                        <p className="text-xs text-muted-foreground -mt-1">{CATALOG_FOCUS_SERVICE_DESCRIPTION_OPTIONAL_NOTE}</p>
                        <FormControl>
                          <Textarea
                            placeholder={placeholders.serviceDescription}
                            className="min-h-[120px] resize-y"
                            {...field}
                          />
                        </FormControl>
                        <p className="text-xs text-muted-foreground flex justify-end tabular-nums">{descriptionLength}/5000</p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="yearsExperience"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Años de experiencia</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 0)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <ProviderSkillsField control={form.control} name="skills" />

                  <FormField
                    control={form.control}
                    name="bio"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center gap-2">
                          <FormLabel className="mb-0">Biografía y enfoque profesional</FormLabel>
                          <BiographyOnboardingInfoButton />
                        </div>
                        <FormDescription>{CATALOG_FOCUS_BIO_DESCRIPTION}</FormDescription>
                        <FormControl>
                          <Textarea
                            placeholder={placeholders.bio}
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

                  {!isTrade && isProfessional ? (
                    <FormField
                      control={form.control}
                      name="certifications"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Certificaciones obtenidas (opcional)</FormLabel>
                          <FormDescription className="text-xs">{CATALOG_FOCUS_CERTIFICATIONS_PROFESSIONAL_DESCRIPTION}</FormDescription>
                          <CertificationsVisibilityHint />
                          <FormControl>
                            <Textarea
                              placeholder="Ej. Abogado de los Tribunales; máster en tributación; PhD en…; certificación CPA…"
                              className="min-h-[100px] resize-y mt-2"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ) : null}
                </>
              ) : null}

              <FormField
                control={form.control}
                name="price"
                render={({ field }) => <input type="hidden" {...field} />}
              />

              <Button type="submit" className="w-full" disabled={submitPending}>
                {submitPending ? "Guardando…" : "Crear servicio"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
