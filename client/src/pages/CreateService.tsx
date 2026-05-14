import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertServiceSchema } from "@shared/schema";
import { z } from "zod";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo } from "react";
import { getCategoryDisplayName, effectiveHiddenCategorySlugs } from "@shared/default-categories";
import { isCatalogAssignableServiceCategorySlug } from "@shared/catalog-service-categories";
import {
  SERVICE_DESCRIPTION_INLINE_HINT,
  ServiceDescriptionInfoButton,
} from "@/components/ServiceDescriptionHints";

const createServiceFormSchema = insertServiceSchema.extend({
  subcategoryId: z.number().int().positive().optional().nullable(),
});

type CreateServiceFormValues = z.infer<typeof createServiceFormSchema>;

export default function CreateService() {
  const { user, isLoading: authLoading } = useAuth();
  const { data: providerFromApi, isLoading: providerApiLoading } = useCurrentProvider();
  /** Proveedor: primero del usuario (auth/me); si no, de la API dedicada (por si auth/me no trajo provider en caché). */
  const provider = user?.provider ?? providerFromApi ?? null;
  const { data: categories } = useCategories();
  const { data: visibility } = useCategoryVisibility();
  const hiddenSlugs = useMemo(
    () => new Set(effectiveHiddenCategorySlugs(visibility?.hiddenSlugs)),
    [visibility]
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

  const usedCategoryIds = useMemo(
    () => new Set(myServices.map((s) => Number((s as { categoryId: number }).categoryId)).filter((n) => !Number.isNaN(n))),
    [myServices]
  );

  const availableCategories = useMemo(() => {
    return assignableCategories.filter((c) => !usedCategoryIds.has(Number(c.id)));
  }, [assignableCategories, usedCategoryIds]);

  const defaultCategoryId = useMemo(() => {
    if (availableCategories.length === 0) return null;
    const prefer = resolvedProviderCategoryId != null ? Number(resolvedProviderCategoryId) : NaN;
    const match = availableCategories.find((c) => Number(c.id) === prefer);
    return match ? Number(match.id) : Number(availableCategories[0].id);
  }, [availableCategories, resolvedProviderCategoryId]);

  const categoryIdValue = form.watch("categoryId");
  const { data: subcategories = [] } = useSubcategories(
    categoryIdValue != null && categoryIdValue > 0 ? categoryIdValue : undefined
  );

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

  if (authLoading || (user?.role === "professional" && !user?.provider && providerApiLoading)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container max-w-md py-20 text-center">
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
      <div className="container max-w-md py-20 text-center">
        <p className="text-muted-foreground mb-4">
          {isProfessional
            ? "Completa tu perfil de proveedor para poder crear servicios."
            : "Debes ser proveedor para crear servicios."}
        </p>
        <Button asChild>
          <Link href="/become-pro">Convertirse en asociado</Link>
        </Button>
      </div>
    );
  }

  function onSubmit(data: CreateServiceFormValues) {
    data.imageUrl = "";
    const payload = { ...data, subcategoryId: data.subcategoryId ?? undefined };
    createService.mutate(payload, {
      onSuccess: () => setLocation("/my-services"),
    });
  }

  if (availableCategories.length === 0) {
    return (
      <div className="container max-w-2xl py-12 px-4">
        <Card>
          <CardHeader>
            <CardTitle>No puedes crear más servicios de catálogo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-muted-foreground">
            <p>
              Ya tienes un servicio publicado en cada categoría disponible (técnicos, profesionales y mantenimiento), o
              no hay categorías activas en la plataforma.
            </p>
            <Button variant="outline" asChild>
              <Link href="/my-services">Volver a Mis servicios</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-2xl py-12 px-4">
      <Card>
        <CardHeader>
          <CardTitle>Agregar nuevo servicio</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Título del servicio</FormLabel>
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
                            {getCategoryDisplayName(cat as any)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Solo se muestran categorías de catálogo que aún no usas en otro servicio propio. Tu perfil de
                      asociado sigue en{" "}
                      <span className="font-medium text-foreground">
                        {providerCategory ? getCategoryDisplayName(providerCategory) : "tu categoría de registro"}
                      </span>
                      ; este servicio puede publicarse en otra categoría si está libre.
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
                      <FormLabel>Subcategoría (opcional)</FormLabel>
                      <Select
                        onValueChange={(v) => field.onChange(v === "none" || !v ? undefined : Number(v))}
                        value={field.value != null ? String(field.value) : "none"}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona una subcategoría" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">Ninguna</SelectItem>
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
                      <Textarea placeholder="Qué incluye este servicio?" className="h-32" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full" disabled={createService.isPending}>
                {createService.isPending ? "Creando..." : "Crear servicio"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
