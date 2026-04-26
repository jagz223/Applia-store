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
import { VehicleSearchCombobox } from "@/components/vehicle/VehicleSearchCombobox";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { api } from "@shared/routes";
import { setVerifyReturnPath } from "@/lib/verify-return-path";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ProviderSkillsField } from "@/components/ProviderSkillsField";
import {
  BiographyOnboardingInfoButton,
  SERVICE_DESCRIPTION_INLINE_HINT,
  ServiceDescriptionInfoButton,
} from "@/components/ServiceDescriptionHints";
import { DEFAULT_CATEGORIES, effectiveHiddenCategorySlugs, getCategoryDisplayName } from "@shared/default-categories";

/** Solo categorías válidas para proveedor (excluye legal/financial, que son subcategorías). */
const PROVIDER_CATEGORY_SLUGS = new Set(DEFAULT_CATEGORIES.map((c) => c.slug));

const VEHICLE_TYPE_OPTIONS: { value: VehicleType; label: string }[] = [
  { value: "motorcycle", label: "Moto" },
  { value: "car", label: "Carro" },
  { value: "pickup_truck", label: "Camioneta" },
  { value: "truck", label: "Camión" },
];

const VEHICLE_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "active", label: "Activo" },
  { value: "inactive", label: "Inactivo" },
  { value: "maintenance", label: "Mantenimiento" },
  { value: "pending_inspection", label: "Inspección pendiente" },
];

function canMarkPetFriendly(vehicleType: string): boolean {
  return vehicleType === "car" || vehicleType === "pickup_truck";
}

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

/** Car Go + Pack Go: bloque de perfil/servicio no se muestra; no exigimos título ni biografía (superRefine). */
function buildBecomeProSchema(categories: { id: number; slug?: string }[]) {
  return insertProviderSchema
    .extend(becomeProCategoryFields)
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
      if (slug === "transport" || slug === "delivery") return;
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
  const isGoDriverCategory = isCarGo || isPackGo;
  const [enablePackGoSoon, setEnablePackGoSoon] = useState(true);
  const [enableShopGoSoon, setEnableShopGoSoon] = useState(true);
  const [enableCarGoAlso, setEnableCarGoAlso] = useState(true);
  const goOfferKind = useMemo(() => {
    if (!isGoDriverCategory) return "carro" as const;
    if (vehicleType === "motorcycle") return "moto" as const;
    if (vehicleType === "pickup_truck") return "camion" as const;
    return "carro" as const;
  }, [isGoDriverCategory, vehicleType]);

  /** Al elegir Car Go / Pack Go ocultamos el bloque de perfil; limpiamos valores por si el usuario cambió de otra categoría. */
  useEffect(() => {
    if (!isGoDriverCategory) return;
    form.setValue("profession", "");
    form.setValue("bio", "");
    form.setValue("serviceTitle", "");
    form.setValue("serviceDescription", "");
    form.setValue("yearsExperience", 0);
    form.setValue("hourlyRate", "");
    form.setValue("skills", []);
  }, [isGoDriverCategory, form]);

  // Si elige Pack Go, por defecto sugerimos habilitar Car Go también (el usuario puede desmarcar).
  useEffect(() => {
    if (isPackGo) setEnableCarGoAlso(true);
  }, [isPackGo]);

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
    if (!canMarkPetFriendly(String(vehicleType ?? "car"))) {
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
    const transport = slug === "transport";
    const delivery = slug === "delivery";
    const goDriver = transport || delivery;

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

    const { vehicle: _vehicleForm, ...rest } = data;
    void _vehicleForm;

    createProvider.mutate(
      {
        ...rest,
        categoryId: data.categoryId,
        category: slug ?? data.category ?? undefined,
        ...(goDriver
          ? {
              goBrands: [
                transport || enableCarGoAlso ? "transport" : null,
                delivery || enablePackGoSoon ? "delivery" : null,
                enableShopGoSoon ? "marketplace" : null,
              ].filter(Boolean),
            }
          : {}),
        subcategoryId: data.subcategoryId ?? undefined,
        skills: goDriver ? [] : data.skills,
        serviceTitle: data.serviceTitle,
        serviceDescription: data.serviceDescription,
        ...(goDriver && vehiclePayload ? { vehicle: vehiclePayload } : {}),
      } as InsertProvider & { serviceTitle?: string; serviceDescription?: string; vehicle?: typeof vehiclePayload },
      {
        onSuccess: () => {
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
          {isCarGo ? "Registro Car Go" : isPackGo ? "Registro Pack Go" : "Datos de proveedor"}
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
              ? "Placa, tipo y estado del vehículo son obligatorios. Puedes completar título del servicio, tarifa y biografía más adelante en tu panel. Tu cuenta debe ser verificada: al guardar, te pediremos identificación y licencia (u otro documento según categoría)."
              : "Indica tu categoría, profesión, experiencia y tarifa. No se publica nada hasta la verificación: al guardar, te llevamos a subir tus archivos para que el equipo revise tu solicitud."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                              {getCategoryDisplayName(cat)}
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
                      const kind = (v as "moto" | "carro" | "camion") ?? "carro";
                      const wanted: VehicleType =
                        kind === "moto" ? "motorcycle" : kind === "camion" ? "pickup_truck" : "car";
                      form.setValue("vehicle.vehicle_type", wanted);
                    }}
                    value={goOfferKind}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona una opción" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="moto">Moto</SelectItem>
                      <SelectItem value="carro">Carro</SelectItem>
                      <SelectItem value="camion">Camión</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              ) : subcategories.length > 0 ? (
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

              {isGoDriverCategory ? (
                <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-2">
                  <p className="font-semibold">También habilitar</p>
                  <p className="text-sm text-muted-foreground">
                    {isCarGo
                      ? "Los conductores Car Go pueden operar también en Pack Go y Shop Go."
                      : "Los repartidores Pack Go pueden operar también en Car Go y Shop Go."}
                  </p>
                  {isCarGo ? (
                    <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/80 px-3 py-2">
                      <span className="min-w-0">
                        <span className="font-medium">Pack Go</span>
                      </span>
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={enablePackGoSoon}
                        onChange={(e) => setEnablePackGoSoon(e.target.checked)}
                      />
                    </label>
                  ) : (
                    <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/80 px-3 py-2">
                      <span className="min-w-0">
                        <span className="font-medium">Car Go</span>
                      </span>
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={enableCarGoAlso}
                        onChange={(e) => setEnableCarGoAlso(e.target.checked)}
                      />
                    </label>
                  )}
                  <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/80 px-3 py-2">
                    <span className="min-w-0">
                      <span className="font-medium">Shop Go</span>{" "}
                      <span className="text-xs text-muted-foreground">(Próximamente activo)</span>
                    </span>
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={enableShopGoSoon}
                      onChange={(e) => setEnableShopGoSoon(e.target.checked)}
                    />
                  </label>
                </div>
              ) : null}

              {isGoDriverCategory && (
                <div className="space-y-4 rounded-lg border border-border/60 bg-muted/30 p-4">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Datos del vehículo</h3>
                    <p className="text-xs text-muted-foreground mt-1">Elige bien el tipo de vehículo que vas a usar.</p>
                    {(nhtsaMakesError || nhtsaModelsError || nhtsaYearsError) && (
                      <p className="text-xs text-destructive mt-2">
                        No se pudo cargar el catálogo. Comprueba tu conexión e inténtalo de nuevo.
                      </p>
                    )}
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="vehicle.vehicle_type"
                      render={({ field }) => (
                        <FormItem className="sm:col-span-2">
                          <FormLabel>Tipo de vehículo</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value ?? "car"}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {VEHICLE_TYPE_OPTIONS.map((o) => (
                                <SelectItem key={o.value} value={o.value}>
                                  {o.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormDescription className="text-xs">
                            Seleccionado:{" "}
                            <span className="font-medium text-foreground">
                              {VEHICLE_TYPE_OPTIONS.find((o) => o.value === (field.value ?? "car"))?.label ?? "Carro"}
                            </span>
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="vehicle.brand"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Marca</FormLabel>
                          <FormControl>
                            <VehicleSearchCombobox
                              value={field.value ?? ""}
                              onChange={(v) => {
                                field.onChange(v);
                                form.setValue("vehicle.model", "");
                              }}
                              options={nhtsaMakes}
                              isLoading={nhtsaMakesLoading}
                              placeholder="Buscar marca…"
                              searchPlaceholder="Escribe para filtrar marcas…"
                              emptyMessage="No hay marcas que coincidan."
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="vehicle.model"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Modelo</FormLabel>
                          <FormControl>
                            <VehicleSearchCombobox
                              value={field.value ?? ""}
                              onChange={field.onChange}
                              options={nhtsaModels}
                              isLoading={nhtsaModelsLoading}
                              disabled={!String(vehicleBrand ?? "").trim()}
                              placeholder={!String(vehicleBrand ?? "").trim() ? "Elige una marca primero" : "Buscar modelo…"}
                              searchPlaceholder="Escribe para filtrar modelos…"
                              emptyMessage={
                                !String(vehicleBrand ?? "").trim()
                                  ? "Selecciona una marca."
                                  : nhtsaModelsLoading
                                    ? "Cargando…"
                                    : "No hay modelos que coincidan."
                              }
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="vehicle.model_year"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Año del vehículo</FormLabel>
                          <FormDescription className="text-xs">
                            Depende de marca y modelo (NHTSA). Escribe para filtrar entre los años disponibles.
                          </FormDescription>
                          <FormControl>
                            <VehicleSearchCombobox
                              value={field.value ? String(field.value) : ""}
                              onChange={(s) =>
                                field.onChange(s ? parseInt(s, 10) : (nhtsaYears[0] ?? new Date().getFullYear()))
                              }
                              options={yearOptionsStrings}
                              isLoading={nhtsaYearsLoading}
                              disabled={!String(vehicleBrand ?? "").trim() || !String(vehicleModelWatch ?? "").trim()}
                              placeholder={
                                !String(vehicleBrand ?? "").trim() || !String(vehicleModelWatch ?? "").trim()
                                  ? "Elige marca y modelo primero"
                                  : nhtsaYearsLoading
                                    ? "Cargando años…"
                                    : "Buscar año…"
                              }
                              searchPlaceholder="Escribe el año…"
                              emptyMessage={
                                nhtsaYearsLoading
                                  ? "Cargando…"
                                  : yearOptionsStrings.length === 0
                                    ? "Sin años en catálogo para esta marca y modelo."
                                    : "Sin coincidencias."
                              }
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="vehicle.license_plate"
                      render={({ field }) => (
                        <FormItem className="sm:col-span-2">
                          <FormLabel>Placa</FormLabel>
                          <FormControl>
                            <Input placeholder="Ej. ABC1234" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="vehicle.vehicle_status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Estado operativo</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value ?? "active"}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {VEHICLE_STATUS_OPTIONS.map((o) => (
                                <SelectItem key={o.value} value={o.value}>
                                  {o.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="vehicle.exterior_color"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Color exterior (opcional)</FormLabel>
                          <FormControl>
                            <Input placeholder="Ej. Blanco perla" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="vehicle.insurance_expires_at"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Vencimiento seguro (opcional)</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="vehicle.mileage_km"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Kilometraje (opcional)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={0}
                              {...field}
                              value={field.value === "" || field.value == null ? "" : field.value}
                              onChange={(e) => {
                                const v = e.target.value;
                                field.onChange(v === "" ? "" : parseInt(v, 10));
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="vehicle.service_notes"
                      render={({ field }) => (
                        <FormItem className="sm:col-span-2">
                          <FormLabel>Notas del vehículo / servicio (opcional)</FormLabel>
                          <FormDescription>Accesorios, condición, equipamiento relevante para el viaje.</FormDescription>
                          <FormControl>
                            <Textarea className="min-h-[72px] resize-y" maxLength={500} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="vehicle.is_pet_friendly"
                      render={({ field }) => (
                        <FormItem className="sm:col-span-2 flex flex-row items-start space-x-3 space-y-0 rounded-md border p-3">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              disabled={!canMarkPetFriendly(String(vehicleType ?? ""))}
                              onCheckedChange={(c) => field.onChange(c === true)}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel className="cursor-pointer">Dispuesto a transportar mascotas</FormLabel>
                            <FormDescription>
                              Solo disponible para tipo carro o camioneta. En otros tipos no aplica.
                            </FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              )}

              {!isGoDriverCategory && (
                <>
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
                          Título público de tu servicio en el catálogo (editable después en «Editar servicio»).
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
                            <Input type="number" {...field} onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 0)} />
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
                            <Input type="number" {...field} />
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
                          Quién eres y cómo trabajas. Si arriba no pusiste descripción del servicio, este texto se usará como
                          descripción inicial de tu oferta cuando estés verificado (luego puedes separarlos en «Editar servicio»).
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
                </>
              )}

              <Button type="submit" className="w-full text-lg h-12" disabled={createProvider.isPending}>
                {createProvider.isPending
                  ? isCarGo
                    ? "Guardando y abriendo verificación…"
                    : "Guardando y abriendo verificación…"
                  : isCarGo
                    ? "Guardar e ir a verificación"
                    : "Guardar e ir a verificación"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
