import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { insertProviderSchema, professionalBioFieldSchema } from "@shared/schema";
import { providerSkillsSchema } from "@shared/skills-schema";
import { type InsertProvider } from "@shared/schema";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateProvider, useCurrentProvider, useCategories, useSubcategories, useCategoryVisibility } from "@/hooks/use-mango-data";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { api } from "@shared/routes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo } from "react";
import { ProviderSkillsField } from "@/components/ProviderSkillsField";
import {
  BiographyOnboardingInfoButton,
  SERVICE_DESCRIPTION_INLINE_HINT,
  ServiceDescriptionInfoButton,
} from "@/components/ServiceDescriptionHints";
import { DEFAULT_CATEGORIES, effectiveHiddenCategorySlugs, getCategoryDisplayName } from "@shared/default-categories";

/** Solo categorías válidas para proveedor (excluye legal/financial, que son subcategorías). */
const PROVIDER_CATEGORY_SLUGS = new Set(DEFAULT_CATEGORIES.map((c) => c.slug));

const becomeProFormSchema = insertProviderSchema
  .extend({
    categoryId: z.number().int().positive({ message: "Selecciona una categoría para tu perfil y tu servicio." }),
    category: z.string().optional(),
    subcategoryId: z.number().int().positive().optional().nullable(),
  })
  .extend({
    bio: professionalBioFieldSchema,
    skills: providerSkillsSchema,
    /** Título público del servicio (mismo valor que en «Editar servicio»). */
    serviceTitle: z
      .string()
      .trim()
      .min(2, { message: "Indica el nombre público de tu servicio (mínimo 2 caracteres)." })
      .max(300),
    /** Qué incluye esta oferta; si lo dejas vacío, se usará la biografía como texto inicial del servicio. */
    serviceDescription: z.string().max(5000, { message: "Máximo 5000 caracteres." }),
  });
type BecomeProForm = z.infer<typeof becomeProFormSchema>;

export default function BecomePro() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { data: visibility } = useCategoryVisibility({ enabled: isAuthenticated });
  const hiddenSlugs = useMemo(
    () => new Set(effectiveHiddenCategorySlugs(isAuthenticated ? visibility?.hiddenSlugs : undefined)),
    [isAuthenticated, visibility]
  );
  const { data: existingProfile, isLoading: profileLoading } = useCurrentProvider();
  const createProvider = useCreateProvider();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const { data: categories = [] } = useCategories();
  const providerCategories = useMemo(
    () =>
      categories.filter(
        (c) => {
          const slug = (c as { slug?: string }).slug;
          return slug && PROVIDER_CATEGORY_SLUGS.has(slug) && !hiddenSlugs.has(slug);
        }
      ),
    [categories, hiddenSlugs]
  );
  const form = useForm<BecomeProForm>({
    resolver: zodResolver(becomeProFormSchema),
    defaultValues: {
      userId: "",
      categoryId: undefined,
      category: undefined,
      subcategoryId: undefined,
      profession: "",
      bio: "",
      skills: [] as string[],
      yearsExperience: 0,
      hourlyRate: "50",
      serviceTitle: "",
      serviceDescription: "",
    },
  });
  const selectedCategoryId = form.watch("categoryId");
  const { data: subcategories = [] } = useSubcategories(selectedCategoryId);

  useEffect(() => {
    if (user) {
      form.setValue("userId", user.id);
    }
  }, [user, form]);

  useEffect(() => {
    form.setValue("subcategoryId", undefined);
  }, [selectedCategoryId, form]);

  useEffect(() => {
    if (existingProfile) {
      setLocation("/professional-dashboard");
    }
  }, [existingProfile, setLocation]);

  if (authLoading || profileLoading) {
    return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin" /></div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="container max-w-md py-20 text-center">
        <h1 className="text-2xl font-bold mb-4">Inicia sesión</h1>
        <p className="mb-6 text-muted-foreground">Necesitas una cuenta para registrarte como proveedor.</p>
        <a href={api.auth.replit.login.path}>
          <Button className="w-full">Iniciar sesión / Registrarse</Button>
        </a>
      </div>
    );
  }

  function onSubmit(data: BecomeProForm) {
    const slug = data.categoryId != null ? categories?.find((c) => c.id === data.categoryId)?.slug : undefined;
    createProvider.mutate(
      {
        ...data,
        categoryId: data.categoryId,
        category: slug ?? data.category ?? undefined,
        subcategoryId: data.subcategoryId ?? undefined,
      } as InsertProvider,
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["user"] });
          queryClient.invalidateQueries({ queryKey: [api.providers.me.path] });
          queryClient.invalidateQueries({ queryKey: ["/api/me/services"] });
          setLocation("/professional-dashboard");
        },
        onError: () => {
          queryClient.invalidateQueries({ queryKey: ["user"] });
        },
      }
    );
  }

  return (
    <div className="container max-w-2xl py-12 px-4">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-display font-bold text-primary mb-2">Datos de proveedor</h1>
        <p className="text-muted-foreground">
          Completa tu perfil. Tu nombre de usuario se muestra en el perfil; el <strong className="text-foreground">nombre del
          servicio</strong> es el título de tu oferta en el buscador (el mismo que podrás editar después).
        </p>
      </div>

      <Card className="border-border/50 shadow-xl">
        <CardHeader>
          <CardTitle>Perfil de proveedor</CardTitle>
          <CardDescription>Indica tu categoría, profesión, experiencia y tarifa. Tu servicio se publicará automáticamente.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="categoryId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Categoría de proveedor</FormLabel>
                    <Select
                      onValueChange={(v) => field.onChange(v ? Number(v) : undefined)}
                      value={field.value != null ? String(field.value) : ""}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona una categoría" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {providerCategories
                          ?.filter((cat) => cat.id != null)
                          .map((cat) => (
                            <SelectItem key={String(cat.id)} value={String(cat.id)}>
                              {getCategoryDisplayName(cat)}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {subcategories.length > 0 && (
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
              )}
                  <FormField
                control={form.control}
                name="profession"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Profesión / Título</FormLabel>
                    <FormControl>
                      <Input placeholder="Ej. Plomero, Diseñador gráfico" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="serviceTitle"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre del servicio</FormLabel>
                    <FormDescription>
                      Título de tu publicación en el listado (qué ofreces y cómo quieres llamar a tu servicio). Es el mismo
                      campo que verás en «Editar servicio»; no tiene por qué coincidir solo con tu nombre personal.
                    </FormDescription>
                    <FormControl>
                      <Input placeholder="Ej. Asesoría legal laboral para PYMEs" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="serviceDescription"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center gap-2">
                      <FormLabel className="mb-0">Descripción del servicio</FormLabel>
                      <ServiceDescriptionInfoButton ariaLabel="Información: descripción del servicio" />
                    </div>
                    <FormDescription>{SERVICE_DESCRIPTION_INLINE_HINT}</FormDescription>
                    <p className="text-xs text-muted-foreground -mt-1">
                      Opcional: si no escribes nada aquí, el texto de tu biografía (más abajo) se usará como descripción
                      inicial del servicio.
                    </p>
                    <FormControl>
                      <Textarea
                        placeholder="Qué incluye esta oferta: alcance, entregables, duración o lo que cubre el precio."
                        className="min-h-[120px] resize-y"
                        {...field}
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground flex justify-end tabular-nums">
                      {(field.value?.length ?? 0)}/5000
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="yearsExperience"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Años de experiencia</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          {...field} 
                          onChange={e => field.onChange(parseInt(e.target.value) || 0)} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="hourlyRate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tarifa por hora (USD)</FormLabel>
                      <FormControl>
                         <Input 
                          type="number" 
                          {...field}
                         />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

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
                    <FormDescription>
                      Quién eres y cómo trabajas. Si arriba no pusiste descripción del servicio, este texto también se usará
                      como descripción inicial de la publicación (luego puedes separarlos en «Editar servicio»).
                    </FormDescription>
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
                disabled={createProvider.isPending}
              >
                {createProvider.isPending ? "Creando perfil y servicio…" : "Crear perfil y servicio"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
