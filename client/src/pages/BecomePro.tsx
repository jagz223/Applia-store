import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { insertProviderSchema } from "@shared/schema";
import { providerSkillsSchema } from "@shared/skills-schema";
import { type InsertProvider } from "@shared/schema";
import { insertProviderVehicleSchema, type VehicleType } from "@shared/vehicle-schema";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateProvider, useCurrentProvider, useCategories, useSubcategories, useCategoryVisibility } from "@/hooks/use-mango-data";
import { useNhtsaMakes, useNhtsaModelsForMake, useNhtsaYearsForMakeModel } from "@/hooks/use-nhtsa-vpic";
import { GoDriverVehicleFormGrid, goVehicleCanMarkPetFriendly } from "@/components/provider/GoDriverVehicleFormGrid";
import { GoThreeServicesReminder } from "@/components/provider/GoThreeServicesReminder";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { api } from "@shared/routes";
import { setVerifyReturnPath } from "@/lib/verify-return-path";
import { markAssociateOnboardingStarted, clearAssociateOnboardingStarted } from "@/lib/associate-onboarding-storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { ProviderSkillsField } from "@/components/ProviderSkillsField";
import {
  BiographyOnboardingInfoButton,
  SERVICE_DESCRIPTION_INLINE_HINT,
  ServiceDescriptionInfoButton,
} from "@/components/ServiceDescriptionHints";
import { CertificationsVisibilityHint } from "@/components/service/CertificationsVisibilityHint";
import { DEFAULT_CATEGORIES, effectiveHiddenCategorySlugs, getCategoryCanonicalName } from "@shared/default-categories";
import {
  GO_DRIVER_OFFER_KIND_LABELS,
  goOfferKindToVehicleType,
  vehicleTypeToGoOfferKind,
  type GoDriverOfferKindSlug,
} from "@shared/go-driver-offer-kind";
import {
  CATALOG_FOCUS_BIO_DESCRIPTION,
  CATALOG_FOCUS_CERTIFICATIONS_PROFESSIONAL_DESCRIPTION,
  CATALOG_FOCUS_CERTIFICATIONS_TRADE_DESCRIPTION,
  CATALOG_FOCUS_PREPARATION_LEVEL_DESCRIPTION,
  CATALOG_FOCUS_SERVICE_DESCRIPTION_OPTIONAL_NOTE,
  CATALOG_FOCUS_SERVICE_TITLE_DESCRIPTION,
  catalogFocusSubcategoryFormDescription,
} from "@shared/catalog-focus-form-copy";

/** Solo categorías válidas para proveedor (excluye legal/financial, que son subcategorías). */
const PROVIDER_CATEGORY_SLUGS = new Set(DEFAULT_CATEGORIES.map((c) => c.slug));

const DEFAULT_VEHICLE_FORM = {
  license_plate: "",
  model_year: new Date().getFullYear(),
  brand: "",
  model: "",
  vehicle_status: "active" as "active" | "inactive" | "maintenance" | "pending_inspection",
  vehicle_type: "car" as VehicleType,
  is_pet_friendly: false,
  exterior_color: "",
  insurance_expires_at: "",
  mileage_km: "" as string | number,
  service_notes: "",
};

type VehicleFormValues = typeof DEFAULT_VEHICLE_FORM;

function buildVehiclePayload(v: VehicleFormValues) {
  const mileageRaw = v.mileage_km === "" || v.mileage_km == null ? null : Number(v.mileage_km);
  return {
    license_plate: v.license_plate.trim(),
    model_year: Number(v.model_year),
    brand: v.brand.trim(),
    model: v.model.trim(),
    vehicle_status: v.vehicle_status,
    vehicle_type: v.vehicle_type,
    is_pet_friendly: Boolean(v.is_pet_friendly),
    exterior_color: v.exterior_color.trim() || null,
    passenger_seats: null,
    insurance_expires_at: v.insurance_expires_at.trim() || null,
    mileage_km: mileageRaw != null && Number.isFinite(mileageRaw) ? mileageRaw : null,
    service_notes: v.service_notes.trim() || null,
  };
}

const becomeProCategoryFields = {
  categoryId: z.number().int().positive({ message: "Selecciona una categoría para tu perfil y tu servicio." }),
  category: z.string().optional(),
  subcategoryId: z.number().int().positive().optional().nullable(),
};

const becomeProTradeFields = {
  preparationLevel: z.string().optional(),
  certifications: z.string().optional(),
};

/** Transporte + delivery: bloque de perfil/servicio no se muestra; no exigimos título ni biografía (superRefine). */
function buildBecomeProSchema(categories: { id: number; slug?: string }[]) {
  return insertProviderSchema
    .extend(becomeProCategoryFields)
    .extend(becomeProTradeFields)
    .extend({
      bio: z.string().trim().max(700, { message: "Máximo 700 caracteres." }),
      skills: providerSkillsSchema,
      serviceTitle: z.string().trim().max(300),
      serviceDescription: z.string().max(5000, { message: "Máximo 5000 caracteres." }),
      hourlyRate: z.preprocess(
        (v) => (v === "" || v == null ? undefined : v),
        z.union([z.string(), z.number()]).optional().nullable()
      ),
    })
    .merge(z.object({ vehicle: z.any().optional() }))
    .superRefine((data, ctx) => {
      const slug = categories.find((c) => c.id === data.categoryId)?.slug;
      if (slug === "transport" || slug === "delivery" || slug === "marketplace") return;

      const needsSub =
        slug === "technical" || slug === "maintenance" || slug === "professional";
      if (needsSub && (data.subcategoryId == null || Number(data.subcategoryId) <= 0)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Selecciona una subcategoría.",
          path: ["subcategoryId"],
        });
      }

      const isTrade = slug === "technical" || slug === "maintenance";
      if (isTrade) {
        const prep = (data.preparationLevel ?? "").trim();
        if (prep.length < 10) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Describe tu nivel de preparación (escolaridad, cursos, talleres). Mínimo 10 caracteres.",
            path: ["preparationLevel"],
          });
        }
        return;
      }

      const title = data.serviceTitle.trim();
      if (title.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Indica el nombre público de tu servicio (mínimo 2 caracteres).",
          path: ["serviceTitle"],
        });
      }
      const bio = data.bio.trim();
      if (bio.length < 50) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Escribe al menos 50 caracteres (un poco más que un eslogan).",
          path: ["bio"],
        });
      }
    });
}

type BecomeProForm = z.infer<ReturnType<typeof buildBecomeProSchema>> & { vehicle: VehicleFormValues };

export default function BecomePro() {
  const { toast } = useToast();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { data: visibility } = useCategoryVisibility();
  const hiddenSlugs = useMemo(
    () => new Set(effectiveHiddenCategorySlugs(visibility?.hiddenSlugs)),
    [visibility]
  );
  const { data: existingProfile, isLoading: profileLoading } = useCurrentProvider();
  const createProvider = useCreateProvider();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const { data: categories = [] } = useCategories();
  const providerCategories = useMemo(
    () =>
      categories.filter((c) => {
        const slug = (c as { slug?: string }).slug;
        return slug && PROVIDER_CATEGORY_SLUGS.has(slug) && !hiddenSlugs.has(slug);
      }),
    [categories, hiddenSlugs]
  );
  const becomeProFormSchema = useMemo(() => buildBecomeProSchema(providerCategories), [providerCategories]);
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
      preparationLevel: "",
      certifications: "",
      vehicle: { ...DEFAULT_VEHICLE_FORM },
    },
  });
  const selectedCategoryId = form.watch("categoryId");
  const vehicleType = form.watch("vehicle.vehicle_type");
  const vehicleBrand = form.watch("vehicle.brand");
  const vehicleModelWatch = form.watch("vehicle.model");
  const { data: subcategories = [] } = useSubcategories(selectedCategoryId);

  const selectedCategorySlug =
    selectedCategoryId != null ? categories.find((c) => c.id === selectedCategoryId)?.slug : undefined;
  const isCarGo = selectedCategorySlug === "transport";
  const isPackGo = selectedCategorySlug === "delivery";
  const isShopGo = selectedCategorySlug === "marketplace";
  const isGoDriverCategory = isCarGo || isPackGo || isShopGo;
  const isTradeCategory = selectedCategorySlug === "technical" || selectedCategorySlug === "maintenance";
  const isProfessionalCategory = selectedCategorySlug === "professional";
  const isFocusCatalogCategory =
    selectedCategorySlug === "professional" ||
    selectedCategorySlug === "technical" ||
    selectedCategorySlug === "maintenance";
  const needsSubcategory =
    selectedCategorySlug === "technical" ||
    selectedCategorySlug === "maintenance" ||
    selectedCategorySlug === "professional";
  const goOfferKind = useMemo(() => {
    if (!isGoDriverCategory) return "carro" as const;
    return vehicleTypeToGoOfferKind(vehicleType);
  }, [isGoDriverCategory, vehicleType]);

  /** Al elegir taxi o delivery ocultamos el bloque de perfil; limpiamos valores por si el usuario cambió de otra categoría. */
  useEffect(() => {
    if (!isGoDriverCategory) return;
    form.setValue("profession", "");
    form.setValue("bio", "");
    form.setValue("serviceTitle", "");
    form.setValue("serviceDescription", "");
    form.setValue("yearsExperience", 0);
    form.setValue("hourlyRate", "");
    form.setValue("skills", []);
    form.setValue("preparationLevel", "");
    form.setValue("certifications", "");
  }, [isGoDriverCategory, form]);

  useEffect(() => {
    if (isTradeCategory) {
      // Mantener campos de perfil/servicio (bio, nombre, descripción, habilidades) para que el registro
      // en Técnicos y Mantenimiento sea coherente con Editar servicio.
      // Solo limpiamos el campo específico de "Profesión / Título", porque en oficios puede ser confuso.
      form.setValue("profession", "");
    }
  }, [isTradeCategory, form]);

  const categoryIntro = useMemo(() => {
    if (!isFocusCatalogCategory) return null;
    if (selectedCategorySlug === "professional") {
      return "Para profesionales (abogados, contadores, psicólogos, asesores): describe tu oferta con un título claro, qué incluye y tu enfoque de trabajo.";
    }
    if (selectedCategorySlug === "technical") {
      return "Para servicios técnicos (computación, electrónica, redes): aclara qué reparas/instalas, el alcance del trabajo y tus habilidades clave.";
    }
    if (selectedCategorySlug === "maintenance") {
      return "Para mantenimiento (refrigeración, plomería, electricidad, aires): detalla el servicio, qué incluye y tu experiencia práctica.";
    }
    return null;
  }, [isFocusCatalogCategory, selectedCategorySlug]);

  const contextualPlaceholders = useMemo(() => {
    if (!isFocusCatalogCategory) {
      return {
        profession: "Ej. Plomero, Diseñador gráfico",
        serviceTitle: "Ej. Asesoría legal laboral para PYMEs",
        serviceDescription: "Qué incluye esta oferta: alcance, entregables, duración o lo que cubre el precio.",
        bio: "Quién eres, tu especialidad, cómo trabajas y qué pueden esperar los clientes. Entre 50 y 700 caracteres.",
      };
    }
    if (selectedCategorySlug === "professional") {
      return {
        profession: "Ej. Abogado, Contador, Psicólogo",
        serviceTitle: "Ej. Asesoría contable para emprendedores",
        serviceDescription:
          "Ej. Qué incluye: revisión, diagnóstico, entrega de documentos, tiempos estimados, alcance del acompañamiento.",
        bio: "Tu experiencia, tu enfoque (cómo trabajas), qué tipo de casos tomas y qué pueden esperar los clientes. 50–700 caracteres.",
      };
    }
    if (selectedCategorySlug === "technical") {
      return {
        profession: "Ej. Técnico en computación, Técnico electrónico",
        serviceTitle: "Ej. Reparación de PC y laptops (diagnóstico + arreglo)",
        serviceDescription:
          "Ej. Qué incluye: diagnóstico, reparación, pruebas, instalación de software, tiempos de entrega, qué NO incluye.",
        bio: "Tu experiencia en equipos/marcas, cómo trabajas, garantías, tiempos y forma de diagnóstico. 50–700 caracteres.",
      };
    }
    return {
      profession: "Ej. Técnico en refrigeración, Plomero, Electricista",
      serviceTitle: "Ej. Mantenimiento preventivo de aires acondicionados",
      serviceDescription:
        "Ej. Qué incluye: limpieza, revisión, pruebas, materiales incluidos/no incluidos, duración aproximada.",
      bio: "Tu experiencia, zonas, tipo de trabajos, materiales/herramientas y tu forma de trabajo. 50–700 caracteres.",
    };
  }, [isFocusCatalogCategory, selectedCategorySlug]);

  const { data: nhtsaMakes = [], isLoading: nhtsaMakesLoading, isError: nhtsaMakesError } = useNhtsaMakes();
  const { data: nhtsaModels = [], isLoading: nhtsaModelsLoading, isError: nhtsaModelsError } =
    useNhtsaModelsForMake(isGoDriverCategory ? vehicleBrand : null);
  const { data: nhtsaYears = [], isLoading: nhtsaYearsLoading, isError: nhtsaYearsError } = useNhtsaYearsForMakeModel(
    isGoDriverCategory ? vehicleBrand : null,
    isGoDriverCategory ? vehicleModelWatch : null
  );
  const yearOptionsStrings = useMemo(() => nhtsaYears.map(String), [nhtsaYears]);

  useEffect(() => {
    if (user) {
      form.setValue("userId", user.id);
    }
  }, [user, form]);

  useEffect(() => {
    form.setValue("subcategoryId", undefined);
  }, [selectedCategoryId, form]);

  useEffect(() => {
    if (!goVehicleCanMarkPetFriendly(String(vehicleType ?? "car"))) {
      form.setValue("vehicle.is_pet_friendly", false);
    }
  }, [vehicleType, form]);

  /** Ajustar año cuando el catálogo vPIC devuelve años válidos para marca+modelo. */
  useEffect(() => {
    if (!isGoDriverCategory) return;
    if (!vehicleBrand?.trim() || !vehicleModelWatch?.trim()) {
      form.setValue("vehicle.model_year", new Date().getFullYear());
      return;
    }
    if (!nhtsaYears.length) return;
    const cur = Number(form.getValues("vehicle.model_year"));
    if (!Number.isFinite(cur) || !nhtsaYears.includes(cur)) {
      form.setValue("vehicle.model_year", nhtsaYears[0]!);
    }
  }, [isGoDriverCategory, vehicleBrand, vehicleModelWatch, nhtsaYears, form.setValue, form.getValues]);

  useEffect(() => {
    if (existingProfile) {
      setLocation("/professional-dashboard");
    }
  }, [existingProfile, setLocation]);

  /** Marca onboarding en curso para recordatorios y enlace «Panel Asociado» → /become-pro. */
  useEffect(() => {
    if (!isAuthenticated || authLoading || profileLoading) return;
    if (existingProfile) return;
    markAssociateOnboardingStarted();
  }, [isAuthenticated, authLoading, profileLoading, existingProfile]);

  if (authLoading || profileLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="animate-spin" />
      </div>
    );
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
    const goDriver =
      slug === "transport" || slug === "delivery" || slug === "marketplace";

    let vehiclePayload: ReturnType<typeof insertProviderVehicleSchema.parse> | undefined;
    if (goDriver) {
      const raw = buildVehiclePayload(data.vehicle ?? DEFAULT_VEHICLE_FORM);
      const parsed = insertProviderVehicleSchema.safeParse(raw);
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        form.setError("root", {
          message: first?.message ?? "Revisa los datos del vehículo.",
        });
        return;
      }
      vehiclePayload = parsed.data;
    }

    const { vehicle: _vehicleForm, preparationLevel: prepRaw, certifications: certsRaw, ...rest } = data;
    void _vehicleForm;

    const isTrade = slug === "technical" || slug === "maintenance";
    const prepTrim = (prepRaw ?? "").trim();
    const certsTrim = (certsRaw ?? "").trim();

    let professionOut = rest.profession;
    let bioOut = rest.bio;
    let serviceTitleOut = data.serviceTitle;
    let serviceDescriptionOut = data.serviceDescription;
    let skillsOut = data.skills ?? [];

    if (isTrade) {
      professionOut = prepTrim.split("\n")[0]?.slice(0, 200) || "Servicios técnicos";
      const certBlock = certsTrim ? `Certificaciones:\n${certsTrim}` : "";
      bioOut = certBlock
        ? [`Nivel de preparación:\n${prepTrim}`, certBlock].join("\n\n")
        : `Nivel de preparación:\n${prepTrim}`;
      const subLabel = subcategories.find((s) => s.id === data.subcategoryId)?.name ?? "Servicio";
      serviceTitleOut = subLabel;
      serviceDescriptionOut = certsTrim.length > 0 ? certsTrim : prepTrim;
      if (certsTrim.length > 0) {
        skillsOut = certsTrim
          .split(/[,;\n]/)
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 25);
        if (skillsOut.length === 0) {
          skillsOut = [certsTrim.slice(0, 120)];
        }
      } else {
        skillsOut = prepTrim
          .split(/[,;\n]/)
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 25);
        if (skillsOut.length === 0 && prepTrim.length > 0) {
          skillsOut = [prepTrim.slice(0, 120)];
        }
      }
    }

    createProvider.mutate(
      {
        ...rest,
        profession: professionOut,
        bio: bioOut,
        categoryId: data.categoryId,
        category: slug ?? data.category ?? undefined,
        ...(goDriver
          ? {
              goBrands: ["transport", "delivery", "marketplace"],
            }
          : {}),
        subcategoryId: data.subcategoryId ?? undefined,
        skills: goDriver ? [] : skillsOut,
        serviceTitle: serviceTitleOut,
        serviceDescription: serviceDescriptionOut,
        ...(goDriver && vehiclePayload ? { vehicle: vehiclePayload } : {}),
        ...(isTrade && prepTrim ? { preparationLevel: prepTrim, coursesCompleted: prepTrim } : {}),
        ...(!goDriver && certsTrim ? { certifications: certsTrim } : {}),
      } as InsertProvider & {
        serviceTitle?: string;
        serviceDescription?: string;
        vehicle?: typeof vehiclePayload;
        preparationLevel?: string;
        coursesCompleted?: string;
        certifications?: string;
      },
      {
        onSuccess: () => {
          clearAssociateOnboardingStarted();
          setVerifyReturnPath("/professional-dashboard");
          // Navegar antes de invalidar queries: si `existingProfile` pasa a existir mientras sigues en /become-pro,
          // el efecto redirigiría al panel y anularía la ida a verificación.
          setLocation("/professional/verify");
          void queryClient.invalidateQueries({ queryKey: ["user"] });
          void queryClient.invalidateQueries({ queryKey: [api.providers.me.path] });
          void queryClient.invalidateQueries({ queryKey: ["/api/me/services"] });
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
        <h1 className="text-3xl font-display font-bold text-primary mb-2">
          {isCarGo
            ? `Registro · ${getCategoryCanonicalName({ slug: "transport" })}`
            : isPackGo
              ? `Registro · ${getCategoryCanonicalName({ slug: "delivery" })}`
              : isShopGo
                ? `Registro · ${getCategoryCanonicalName({ slug: "marketplace" })}`
                : "Datos de proveedor"}
        </h1>
        <p className="text-muted-foreground">
          {isGoDriverCategory ? (
            <>
              Completa los datos del <strong className="text-foreground">vehículo</strong>. Se guardará tu perfil y la
              unidad asociada. Al terminar, te llevaremos a{" "}
              <strong className="text-foreground">verificación</strong> para subir tus documentos; hasta aprobarla no podrán
              usarse tus servicios en la plataforma.
            </>
          ) : (
            <>
              Completa tu perfil. Tu nombre de usuario se muestra en el perfil; el{" "}
              <strong className="text-foreground">nombre del servicio</strong> será el título de tu oferta cuando estés
              verificado. Al enviar el formulario pasarás a <strong className="text-foreground">verificación</strong> para
              subir tus documentos.
            </>
          )}
        </p>
      </div>

      <Card className="border-border/50 shadow-xl">
        <CardHeader>
          <CardTitle>{isGoDriverCategory ? "Conductor y vehículo" : "Perfil de proveedor"}</CardTitle>
          <CardDescription>
            {isGoDriverCategory
              ? "Placa, tipo y estado del vehículo son obligatorios. Puedes completar título del servicio y biografía más adelante en tu panel. Tu cuenta debe ser verificada: al guardar, te pediremos identificación y licencia (u otro documento según categoría)."
              : "Indica tu categoría, profesión y experiencia. No se publica nada hasta la verificación: al guardar, te llevamos a subir tus archivos para que el equipo revise tu solicitud."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit, () => {
                toast({
                  variant: "destructive",
                  title: "Formulario incompleto",
                  description:
                    "Revisa los campos marcados en rojo. No puedes pasar a verificación hasta completar todos los obligatorios (categoría, datos del vehículo o perfil según tu caso).",
                });
              })}
              className="space-y-6"
            >
              {form.formState.errors.root?.message && (
                <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
              )}
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
                              {getCategoryCanonicalName(cat)}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {isGoDriverCategory ? (
                <FormItem>
                  <FormLabel>Tipo de oferta (subcategoría)</FormLabel>
                  <Select
                    onValueChange={(v) => {
                      const kind = (v as GoDriverOfferKindSlug) ?? "carro";
                      form.setValue("vehicle.vehicle_type", goOfferKindToVehicleType(kind));
                    }}
                    value={goOfferKind}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona una opción" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="moto">{GO_DRIVER_OFFER_KIND_LABELS.moto}</SelectItem>
                      <SelectItem value="carro">{GO_DRIVER_OFFER_KIND_LABELS.carro}</SelectItem>
                      <SelectItem value="camion">{GO_DRIVER_OFFER_KIND_LABELS.camion}</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              ) : subcategories.length > 0 ? (
                <FormField
                  control={form.control}
                  name="subcategoryId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{needsSubcategory ? "Subcategoría" : "Subcategoría (opcional)"}</FormLabel>
                      <FormDescription className="text-xs">{catalogFocusSubcategoryFormDescription(needsSubcategory)}</FormDescription>
                      <Select
                        onValueChange={(v) => field.onChange(v === "none" || !v ? undefined : Number(v))}
                        value={field.value != null ? String(field.value) : needsSubcategory ? undefined : "none"}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona una subcategoría" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {!needsSubcategory ? <SelectItem value="none">Ninguna</SelectItem> : null}
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

              {isGoDriverCategory ? <GoThreeServicesReminder /> : null}

              {isGoDriverCategory && (
                <GoDriverVehicleFormGrid
                  control={form.control}
                  setValue={form.setValue}
                  vehicleType={vehicleType}
                  vehicleBrand={vehicleBrand}
                  vehicleModelWatch={vehicleModelWatch}
                  nhtsaMakes={nhtsaMakes}
                  nhtsaMakesLoading={nhtsaMakesLoading}
                  nhtsaMakesError={nhtsaMakesError}
                  nhtsaModels={nhtsaModels}
                  nhtsaModelsLoading={nhtsaModelsLoading}
                  nhtsaModelsError={nhtsaModelsError}
                  nhtsaYears={nhtsaYears}
                  nhtsaYearsLoading={nhtsaYearsLoading}
                  nhtsaYearsError={nhtsaYearsError}
                  yearOptionsStrings={yearOptionsStrings}
                  sectionTitle="Datos del vehículo"
                  sectionLead="Elige bien el tipo de vehículo que vas a usar."
                  nhtsaErrorMessage="No se pudo cargar el catálogo. Comprueba tu conexión e inténtalo de nuevo."
                />
              )}

              {!isGoDriverCategory && isFocusCatalogCategory && categoryIntro ? (
                <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                  <p className="text-sm font-semibold text-foreground">Guía rápida</p>
                  <p className="text-sm text-muted-foreground mt-1">{categoryIntro}</p>
                </div>
              ) : null}

              {!isGoDriverCategory && isTradeCategory && (
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
                    name="hourlyRate"
                    render={({ field }) => (
                      <input
                        type="hidden"
                        name={field.name}
                        ref={field.ref}
                        onBlur={field.onBlur}
                        onChange={field.onChange}
                        value={field.value ?? ""}
                      />
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="yearsExperience"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Años de experiencia</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 0)} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}

              {!isGoDriverCategory && isFocusCatalogCategory && (
                <>
                  <FormField
                    control={form.control}
                    name="profession"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Profesión / Título</FormLabel>
                        <FormControl>
                          <Input placeholder={contextualPlaceholders.profession} {...field} />
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
                        <FormDescription>{CATALOG_FOCUS_SERVICE_TITLE_DESCRIPTION}</FormDescription>
                        <FormControl>
                          <Input placeholder={contextualPlaceholders.serviceTitle} {...field} />
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
                        <p className="text-xs text-muted-foreground -mt-1">{CATALOG_FOCUS_SERVICE_DESCRIPTION_OPTIONAL_NOTE}</p>
                        <FormControl>
                          <Textarea
                            placeholder={contextualPlaceholders.serviceDescription}
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

                  <FormField
                    control={form.control}
                    name="hourlyRate"
                    render={({ field }) => (
                      <input
                        type="hidden"
                        name={field.name}
                        ref={field.ref}
                        onBlur={field.onBlur}
                        onChange={field.onChange}
                        value={field.value ?? ""}
                      />
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="yearsExperience"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Años de experiencia</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 0)} />
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
                            placeholder={contextualPlaceholders.bio}
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

                  {!isTradeCategory && isProfessionalCategory ? (
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
              )}

              <Button type="submit" className="w-full text-lg h-12" disabled={createProvider.isPending}>
                {createProvider.isPending ? "Guardando y abriendo verificación…" : "Guardar e ir a verificación"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
