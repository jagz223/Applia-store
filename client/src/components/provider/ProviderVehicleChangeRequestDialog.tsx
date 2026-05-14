import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { insertProviderVehicleSchema, type VehicleType } from "@shared/vehicle-schema";
import { isMobilityGoDriverVehicleCategorySlug, MOBILITY_GO_PROVIDER_SLUGS } from "@shared/default-categories";
import { useCategories, useCurrentProvider } from "@/hooks/use-mango-data";
import { useNhtsaMakes, useNhtsaModelsForMake, useNhtsaYearsForMakeModel } from "@/hooks/use-nhtsa-vpic";
import { VehicleSearchCombobox } from "@/components/vehicle/VehicleSearchCombobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

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

const DEFAULT_VEHICLE = {
  license_plate: "",
  model_year: new Date().getFullYear(),
  brand: "",
  model: "",
  vehicle_status: "active" as const,
  vehicle_type: "car" as VehicleType,
  is_pet_friendly: false,
  exterior_color: "",
  insurance_expires_at: "",
  mileage_km: "" as string | number,
  service_notes: "",
};

function canMarkPetFriendly(vehicleType: string): boolean {
  return vehicleType === "car" || vehicleType === "pickup_truck";
}

function buildVehiclePayload(v: typeof DEFAULT_VEHICLE) {
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

function mapApiRowToVehicleForm(row: Record<string, unknown> | null | undefined): typeof DEFAULT_VEHICLE {
  if (!row) return { ...DEFAULT_VEHICLE };
  const vt = String(row.vehicle_type ?? "car").trim();
  const safeType = (VEHICLE_TYPE_OPTIONS.some((o) => o.value === vt) ? vt : "car") as VehicleType;
  return {
    license_plate: String(row.license_plate ?? ""),
    model_year: typeof row.model_year === "number" ? row.model_year : Number(row.model_year) || new Date().getFullYear(),
    brand: String(row.brand ?? ""),
    model: String(row.model ?? ""),
    vehicle_status: (String(row.vehicle_status ?? "active") as typeof DEFAULT_VEHICLE.vehicle_status) || "active",
    vehicle_type: safeType,
    is_pet_friendly: !!row.is_pet_friendly,
    exterior_color: String(row.exterior_color ?? ""),
    insurance_expires_at: String(row.insurance_expires_at ?? "").slice(0, 10),
    mileage_km: row.mileage_km != null ? String(row.mileage_km) : "",
    service_notes: String(row.service_notes ?? ""),
  };
}

const formSchema = z.object({
  categoryId: z.number().int().positive(),
  alsoOtherGo: z.boolean(),
  reason: z.string().min(8, "Explica el motivo (mín. 8 caracteres).").max(400),
});

type FormValues = z.infer<typeof formSchema> & { vehicle: typeof DEFAULT_VEHICLE };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fila completa de GET /api/me/provider-vehicle (snake_case). */
  vehicleRow: Record<string, unknown> | null | undefined;
};

export function ProviderVehicleChangeRequestDialog({ open, onOpenChange, vehicleRow }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: categories = [] } = useCategories();
  const { data: provider } = useCurrentProvider();
  const [sending, setSending] = useState(false);

  const goCategories = useMemo(() => {
    const allowed = new Set(MOBILITY_GO_PROVIDER_SLUGS.map((s) => s.toLowerCase()));
    return categories.filter((c) => allowed.has(String(c.slug ?? "").trim().toLowerCase()));
  }, [categories]);

  const form = useForm<FormValues>({
    defaultValues: {
      categoryId: goCategories[0]?.id ?? 1,
      alsoOtherGo: false,
      vehicle: { ...DEFAULT_VEHICLE },
      reason: "",
    },
  });

  const categoryId = form.watch("categoryId");
  const vehicleType = form.watch("vehicle.vehicle_type");
  const vehicleBrand = form.watch("vehicle.brand");
  const vehicleModelWatch = form.watch("vehicle.model");
  const alsoOtherGo = form.watch("alsoOtherGo");

  const selectedSlug = useMemo(
    () => categories.find((c) => c.id === categoryId)?.slug,
    [categories, categoryId],
  );
  const isTransport = selectedSlug === "transport";
  const isDelivery = selectedSlug === "delivery";
  const isMarketplace = selectedSlug === "marketplace";
  const useMobilityVehicleCatalog = isTransport || isDelivery || isMarketplace;

  const { data: nhtsaMakes = [], isLoading: nhtsaMakesLoading, isError: nhtsaMakesError } = useNhtsaMakes();
  const { data: nhtsaModels = [], isLoading: nhtsaModelsLoading, isError: nhtsaModelsError } =
    useNhtsaModelsForMake(useMobilityVehicleCatalog ? vehicleBrand : null);
  const { data: nhtsaYears = [], isLoading: nhtsaYearsLoading, isError: nhtsaYearsError } = useNhtsaYearsForMakeModel(
    useMobilityVehicleCatalog ? vehicleBrand : null,
    useMobilityVehicleCatalog ? vehicleModelWatch : null,
  );
  const yearOptionsStrings = useMemo(() => nhtsaYears.map(String), [nhtsaYears]);

  useEffect(() => {
    if (!canMarkPetFriendly(String(vehicleType ?? "car"))) {
      form.setValue("vehicle.is_pet_friendly", false);
    }
  }, [vehicleType, form]);

  useEffect(() => {
    if (!open || !provider) return;
    const p = provider as { categoryId?: number; goBrands?: string[] | null };
    const goIds = new Set(goCategories.map((c) => c.id));
    const catId = p.categoryId != null && goIds.has(p.categoryId) ? p.categoryId : goCategories[0]?.id;
    if (catId) form.setValue("categoryId", catId);
    const brands = Array.isArray(p.goBrands) ? p.goBrands.map((s) => String(s).toLowerCase()) : [];
    const slug = categories.find((c) => c.id === catId)?.slug;
    if (slug === "transport") {
      form.setValue("alsoOtherGo", brands.includes("delivery"));
    } else if (slug === "delivery") {
      form.setValue("alsoOtherGo", brands.includes("transport"));
    } else {
      form.setValue("alsoOtherGo", false);
    }
    form.setValue("vehicle", mapApiRowToVehicleForm(vehicleRow ?? null));
    form.setValue("reason", "");
  }, [open, provider, vehicleRow, goCategories, categories, form]);

  useEffect(() => {
    if (!useMobilityVehicleCatalog) return;
    if (!vehicleBrand?.trim() || !vehicleModelWatch?.trim()) {
      form.setValue("vehicle.model_year", new Date().getFullYear());
      return;
    }
    if (!nhtsaYears.length) return;
    const cur = Number(form.getValues("vehicle.model_year"));
    if (!Number.isFinite(cur) || !nhtsaYears.includes(cur)) {
      form.setValue("vehicle.model_year", nhtsaYears[0]!);
    }
  }, [useMobilityVehicleCatalog, vehicleBrand, vehicleModelWatch, nhtsaYears, form]);

  const goOfferKind = useMemo(() => {
    if (!useMobilityVehicleCatalog) return "carro" as const;
    if (vehicleType === "motorcycle") return "moto" as const;
    if (vehicleType === "pickup_truck" || vehicleType === "truck") return "camion" as const;
    return "carro" as const;
  }, [useMobilityVehicleCatalog, vehicleType]);

  const buildGoBrands = (): string[] => {
    const slug = categories.find((c) => c.id === form.getValues("categoryId"))?.slug;
    const brands = new Set<string>();
    if (slug === "transport") {
      brands.add("transport");
      if (alsoOtherGo) brands.add("delivery");
    } else if (slug === "delivery") {
      brands.add("delivery");
      if (alsoOtherGo) brands.add("transport");
    } else if (slug === "marketplace") {
      brands.add("marketplace");
    }
    return Array.from(brands);
  };

  const onSubmit = async (data: FormValues) => {
    const parsedMeta = formSchema.safeParse({
      categoryId: data.categoryId,
      alsoOtherGo: data.alsoOtherGo,
      reason: data.reason,
    });
    if (!parsedMeta.success) {
      toast({
        variant: "destructive",
        title: "Revisa el formulario",
        description: parsedMeta.error.errors[0]?.message ?? "Datos inválidos.",
      });
      return;
    }
    const slug = categories.find((c) => c.id === data.categoryId)?.slug;
    if (!isMobilityGoDriverVehicleCategorySlug(slug)) {
      toast({
        variant: "destructive",
        title: "Categoría inválida",
        description: "Elige taxi, delivery o marketplace.",
      });
      return;
    }
    const rawVehicle = buildVehiclePayload(data.vehicle as unknown as typeof DEFAULT_VEHICLE);
    const parsedV = insertProviderVehicleSchema.safeParse(rawVehicle);
    if (!parsedV.success) {
      toast({
        variant: "destructive",
        title: "Revisa el vehículo",
        description: parsedV.error.errors[0]?.message ?? "Datos incompletos.",
      });
      return;
    }
    const token = localStorage.getItem("token");
    if (!token) return;
    setSending(true);
    try {
      const res = await fetch("/api/me/account-change-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          field: "vehicle",
          reason: parsedMeta.data.reason.trim(),
          proposal: {
            categoryId: parsedMeta.data.categoryId,
            subcategoryId: (provider as { subcategoryId?: number | null })?.subcategoryId ?? null,
            goBrands: buildGoBrands(),
            vehicle: parsedV.data,
          },
        }),
      });
      if (res.status === 409) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Ya hay una solicitud pendiente.");
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "No se pudo enviar");
      }
      toast({
        title: "Solicitud enviada",
        description: "Un administrador revisará los datos del vehículo antes de aplicarlos.",
      });
      void queryClient.invalidateQueries({ queryKey: ["/api/me/account-change-requests"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/me/provider-vehicle"] });
      onOpenChange(false);
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Error",
        description: e instanceof Error ? e.message : "Intenta de nuevo.",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(92dvh,720px)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Solicitar cambio de vehículo</DialogTitle>
          <DialogDescription>
            La solicitud requiere aprobación del equipo. Ajusta el tipo de oferta (subcategoría) y los datos del
            vehículo; cuando se apruebe, se actualizará tu perfil.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {(isTransport || isDelivery || isMarketplace) && (
              <FormItem>
                <FormLabel>Tipo de oferta (subcategoría)</FormLabel>
                <Select
                  onValueChange={(v) => {
                    const kind = (v as "moto" | "carro" | "camion") ?? "carro";
                    const cur = form.getValues("vehicle.vehicle_type") as VehicleType | undefined;
                    const wanted: VehicleType =
                      kind === "moto"
                        ? "motorcycle"
                        : kind === "camion"
                          ? cur === "truck" || cur === "pickup_truck"
                            ? cur
                            : "pickup_truck"
                          : "car";
                    form.setValue("vehicle.vehicle_type", wanted);
                  }}
                  value={goOfferKind}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="moto">Moto</SelectItem>
                    <SelectItem value="carro">Carro</SelectItem>
                    <SelectItem value="camion">Camión / camioneta</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            )}

            <div className="space-y-3 rounded-lg border border-border/60 bg-muted/30 p-3">
              <p className="text-sm font-semibold">Datos del vehículo</p>
              {(nhtsaMakesError || nhtsaModelsError || nhtsaYearsError) && (
                <p className="text-xs text-destructive">No se pudo cargar el catálogo de marcas/modelos.</p>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
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
                        <VehicleSearchCombobox
                          value={field.value ?? ""}
                          onChange={(v) => {
                            field.onChange(v);
                            form.setValue("vehicle.model", "");
                          }}
                          options={nhtsaMakes}
                          isLoading={nhtsaMakesLoading}
                          placeholder="Buscar marca…"
                          searchPlaceholder="Filtrar marcas…"
                          emptyMessage="Sin coincidencias."
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
                          placeholder={!String(vehicleBrand ?? "").trim() ? "Elige marca primero" : "Buscar modelo…"}
                          searchPlaceholder="Filtrar modelos…"
                          emptyMessage="Sin coincidencias."
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
                      <FormLabel>Año</FormLabel>
                      <FormControl>
                        <VehicleSearchCombobox
                          value={field.value ? String(field.value) : ""}
                          onChange={(s) =>
                            field.onChange(s ? parseInt(s, 10) : (nhtsaYears[0] ?? new Date().getFullYear()))
                          }
                          options={yearOptionsStrings}
                          isLoading={nhtsaYearsLoading}
                          disabled={!String(vehicleBrand ?? "").trim() || !String(vehicleModelWatch ?? "").trim()}
                          placeholder="Año"
                          searchPlaceholder="Filtrar año…"
                          emptyMessage="Sin años."
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
                {canMarkPetFriendly(String(vehicleType ?? "")) ? (
                  <FormField
                    control={form.control}
                    name="vehicle.is_pet_friendly"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between sm:col-span-2 rounded-md border p-2">
                        <FormLabel className="text-sm">Apto mascotas (Pet Car)</FormLabel>
                        <FormControl>
                          <input type="checkbox" className="h-4 w-4" checked={!!field.value} onChange={(e) => field.onChange(e.target.checked)} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                ) : null}
                <FormField
                  control={form.control}
                  name="vehicle.exterior_color"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Color (opcional)</FormLabel>
                      <FormControl>
                        <Input {...field} />
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
              </div>
            </div>

            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Motivo del cambio</FormLabel>
                  <FormControl>
                    <Textarea rows={3} placeholder="Ej.: Cambié de moto a carro, vendí la unidad anterior…" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={sending}>
                {sending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Enviando…
                  </>
                ) : (
                  "Enviar solicitud"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
