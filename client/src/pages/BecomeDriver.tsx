import { useEffect, useMemo, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Redirect, useLocation } from "wouter";
import { professionalBioFieldSchema } from "@shared/schema";
import { insertProviderVehicleSchema, type VehicleType } from "@shared/vehicle-schema";
import { useAuth } from "@/hooks/use-auth";
import {
  useCategoryVisibility,
  useCurrentProvider,
  useEnrollGoDriver,
  useProviderVehicle,
  type ProviderPrimaryVehicle,
} from "@/hooks/use-mango-data";
import { effectiveHiddenCategorySlugs } from "@shared/default-categories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ArrowLeft, Car } from "lucide-react";
import {
  BiographyOnboardingInfoButton,
  SERVICE_DESCRIPTION_INLINE_HINT,
  ServiceDescriptionInfoButton,
} from "@/components/ServiceDescriptionHints";

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

type VehicleFormValues = Omit<typeof DEFAULT_VEHICLE_FORM, "model_year"> & {
  model_year: number | "";
};

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
    passenger_seats: null as number | null,
    insurance_expires_at: v.insurance_expires_at.trim() || null,
    mileage_km: mileageRaw != null && Number.isFinite(mileageRaw) ? mileageRaw : null,
    service_notes: v.service_notes.trim() || null,
  };
}

const baseDriverSchema = z.object({
  profession: z.string().trim().min(2, { message: "Indica tu rol o especialidad (mín. 2 caracteres)." }).max(200),
  bio: professionalBioFieldSchema,
  serviceTitle: z.string().trim().min(2, { message: "Indica el nombre público de tu oferta." }).max(500),
  serviceDescription: z
    .string()
    .trim()
    .min(50, { message: "Describe tu oferta con al menos 50 caracteres." })
    .max(5000, { message: "Máximo 5000 caracteres." }),
});

type ProviderSeed = {
  profession?: string | null;
  bio?: string | null;
  goDriverOfferTitle?: string | null;
  goDriverOfferDescription?: string | null;
};

type FormValues = z.infer<typeof baseDriverSchema> & { vehicle: VehicleFormValues };

function BecomeDriverFormBody({
  hasPrimaryVehicle,
  provider,
  vehicleData,
}: {
  hasPrimaryVehicle: boolean;
  provider: unknown;
  vehicleData: ProviderPrimaryVehicle | null | undefined;
}) {
  const [, setLocation] = useLocation();
  const schema = useMemo(() => {
    if (hasPrimaryVehicle) {
      return baseDriverSchema.extend({ vehicle: z.any().optional() });
    }
    return baseDriverSchema.extend({ vehicle: insertProviderVehicleSchema });
  }, [hasPrimaryVehicle]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as any,
    defaultValues: {
      profession: "",
      bio: "",
      serviceTitle: "",
      serviceDescription: "",
      vehicle: { ...DEFAULT_VEHICLE_FORM },
    },
  });

  const seededRef = useRef(false);
  useEffect(() => {
    if (!provider || seededRef.current) return;
    seededRef.current = true;
    const p = provider as ProviderSeed;
    form.reset({
      profession: (p.profession ?? "").trim(),
      bio: (p.bio ?? "").trim(),
      serviceTitle: (p.goDriverOfferTitle ?? "").trim(),
      serviceDescription: (p.goDriverOfferDescription ?? "").trim(),
      vehicle: { ...DEFAULT_VEHICLE_FORM },
    });
  }, [provider, form]);

  const vt = form.watch("vehicle.vehicle_type");
  useEffect(() => {
    if (!canMarkPetFriendly(String(vt ?? ""))) {
      form.setValue("vehicle.is_pet_friendly", false);
    }
  }, [vt, form]);

  const enroll = useEnrollGoDriver();

  const onSubmit = async (values: FormValues) => {
    await enroll.mutateAsync({
      profession: values.profession.trim(),
      bio: values.bio.trim(),
      serviceTitle: values.serviceTitle.trim(),
      serviceDescription: values.serviceDescription.trim(),
      ...(hasPrimaryVehicle ? {} : { vehicle: buildVehiclePayload(values.vehicle) }),
    });
    setLocation("/my-services");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Datos para Genfeb Go</CardTitle>
        <CardDescription>
          La información se usa en tu perfil de asociado y en paneles de conductor. La verificación y suscripción de listado
          siguen las reglas generales de la plataforma.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Perfil de conductor</h3>
              <FormField
                control={form.control}
                name="profession"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Profesión o rol</FormLabel>
                    <FormControl>
                      <Input placeholder="Ej. Conductor ejecutivo, reparto urbano…" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="bio"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center gap-2">
                      <FormLabel>Biografía</FormLabel>
                      <BiographyOnboardingInfoButton />
                    </div>
                    <FormControl>
                      <Textarea rows={5} placeholder="Experiencia, zonas, idiomas, disponibilidad…" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Tu oferta (taxi y delivery)</h3>
              <FormField
                control={form.control}
                name="serviceTitle"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre público de la oferta</FormLabel>
                    <FormControl>
                      <Input placeholder="Ej. Traslados aeropuerto y paquetería express" {...field} />
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
                    <div className="flex flex-wrap items-center gap-2">
                      <FormLabel>Descripción de la oferta</FormLabel>
                      <ServiceDescriptionInfoButton />
                    </div>
                    <FormDescription className="text-xs">{SERVICE_DESCRIPTION_INLINE_HINT}</FormDescription>
                    <FormControl>
                      <Textarea rows={6} placeholder="Qué incluye taxi y qué aceptas en delivery, horarios, límites…" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {hasPrimaryVehicle ? (
              <div className="rounded-lg border border-border bg-muted/25 p-4 text-sm">
                <p className="font-medium text-foreground">Vehículo ya registrado</p>
                <p className="mt-1 text-muted-foreground">
                  {vehicleData?.brand} {vehicleData?.model} · Placa {vehicleData?.license_plate ?? "—"} · Año{" "}
                  {vehicleData?.model_year ?? "—"}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Para cambiar datos del vehículo contacta soporte o usa la configuración del conductor en la app Go cuando
                  esté disponible.
                </p>
              </div>
            ) : (
              <div className="space-y-4 rounded-lg border border-border/60 bg-muted/30 p-4">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Datos del vehículo</h3>
                  <p className="text-xs text-muted-foreground mt-1">Obligatorio para activar taxi y delivery.</p>
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
                          <Input placeholder="Ej. Toyota" {...field} />
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
                          <Input placeholder="Ej. Corolla" {...field} />
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
                        <FormLabel>Año</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1995}
                            max={new Date().getFullYear() + 1}
                            {...field}
                            onChange={(e) => field.onChange(e.target.value === "" ? "" : Number(e.target.value))}
                            value={field.value === "" || field.value == null ? "" : field.value}
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
                      <FormItem>
                        <FormLabel>Placa</FormLabel>
                        <FormControl>
                          <Input placeholder="Placa" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="vehicle.vehicle_status"
                    render={({ field }) => (
                      <FormItem className="sm:col-span-2">
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
                        <FormLabel>Color (opcional)</FormLabel>
                        <FormControl>
                          <Input placeholder="Color" {...field} />
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
                        <FormLabel>Vence seguro (YYYY-MM-DD, opcional)</FormLabel>
                        <FormControl>
                          <Input placeholder="2026-12-31" {...field} />
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
                            placeholder="km"
                            {...field}
                            value={field.value === "" || field.value == null ? "" : field.value}
                            onChange={(e) => {
                              const v = e.target.value;
                              field.onChange(v === "" ? "" : Number(v));
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
                        <FormLabel>Notas del vehículo (opcional)</FormLabel>
                        <FormControl>
                          <Textarea rows={2} placeholder="Accesorios, condición…" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="vehicle.is_pet_friendly"
                    render={({ field }) => {
                      const curVt = form.watch("vehicle.vehicle_type");
                      const allowed = canMarkPetFriendly(String(curVt ?? ""));
                      return (
                        <FormItem className="sm:col-span-2 flex flex-row items-start space-x-3 space-y-0 rounded-md border border-border/60 p-3">
                          <FormControl>
                            <Checkbox
                              checked={!!field.value}
                              disabled={!allowed}
                              onCheckedChange={(c) => field.onChange(!!c)}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Transporte pet friendly</FormLabel>
                            <FormDescription className="text-xs">Solo aplica a carro o camioneta.</FormDescription>
                          </div>
                        </FormItem>
                      );
                    }}
                  />
                </div>
              </div>
            )}

            <Button type="submit" className="w-full sm:w-auto gap-2" disabled={enroll.isPending}>
              {enroll.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Guardar y activar taxi + delivery
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

export default function BecomeDriver() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { data: visibility } = useCategoryVisibility();
  const hiddenSlugs = useMemo(
    () => new Set(effectiveHiddenCategorySlugs(visibility?.hiddenSlugs)),
    [visibility]
  );
  const mobilityDisabled = hiddenSlugs.has("transport") && hiddenSlugs.has("delivery");

  const { data: provider, isLoading: providerLoading } = useCurrentProvider();
  const { data: vehicleData, isLoading: vehicleLoading } = useProviderVehicle({
    enabled: isAuthenticated && !!provider,
  });

  const hasPrimaryVehicle = !!vehicleData && typeof vehicleData.vehicle_type === "string";
  const ready = !authLoading && !providerLoading && (!provider || !vehicleLoading);

  if (!authLoading && !isAuthenticated) {
    return <Redirect to="/login" />;
  }

  if (ready && !provider) {
    return <Redirect to="/become-pro" />;
  }

  if (mobilityDisabled) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-muted/30 to-background py-12 px-4">
        <div className="mx-auto max-w-lg">
          <Card>
            <CardHeader>
              <CardTitle>Conductor Go no disponible</CardTitle>
              <CardDescription>
                Los módulos de taxi y delivery están desactivados en la plataforma en este momento.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="gap-2" onClick={() => setLocation("/my-services")}>
                <ArrowLeft className="h-4 w-4" />
                Volver a Mis servicios
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!ready || !provider) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Cargando…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/30 to-background py-8 px-4">
      <div className="mx-auto max-w-2xl space-y-6">
        <Button variant="ghost" className="gap-2 -ml-2" onClick={() => setLocation("/my-services")}>
          <ArrowLeft className="h-4 w-4" />
          Mis servicios
        </Button>

        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Car className="h-6 w-6" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">Convertirse en conductor</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Completa tu perfil, describe tu oferta para taxi y delivery, y registra tu vehículo si aún no lo has hecho. Al
              guardar se habilitan en tu cuenta los módulos de taxi (transporte) y pedidos (delivery) en Genfeb Go.
            </p>
          </div>
        </div>

        <BecomeDriverFormBody
          key={hasPrimaryVehicle ? "with-vehicle" : "no-vehicle"}
          hasPrimaryVehicle={hasPrimaryVehicle}
          provider={provider}
          vehicleData={vehicleData}
        />
      </div>
    </div>
  );
}
