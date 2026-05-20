import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import type { Control, FieldValues, UseFormSetValue } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, Redirect, useLocation } from "wouter";
import { insertProviderVehicleSchema, type VehicleType } from "@shared/vehicle-schema";
import { useAuth } from "@/hooks/use-auth";
import {
  useCategories,
  useCategoryVisibility,
  useCurrentProvider,
  useEnrollGoDriver,
  useProviderVehicle,
  type ProviderPrimaryVehicle,
} from "@/hooks/use-mango-data";
import { useNhtsaMakes, useNhtsaModelsForMake, useNhtsaYearsForMakeModel } from "@/hooks/use-nhtsa-vpic";
import { effectiveHiddenCategorySlugs } from "@shared/default-categories";
import { providerHasGoBrand, type ProviderGoRef } from "@shared/provider-go";
import {
  isPrimaryMobilityProviderCategory,
  resolveProviderPrimaryCategorySlug,
} from "@shared/become-driver-eligibility";
import { SETTINGS_VEHICLE_SECTION_QUERY_KEY } from "@shared/settings-notification-urls";
import {
  GO_DRIVER_OFFER_KIND_LABELS,
  goOfferKindToVehicleType,
  vehicleTypeToGoOfferKind,
  type GoDriverOfferKindSlug,
} from "@shared/go-driver-offer-kind";
import {
  BECOME_DRIVER_CARD_DESCRIPTION,
  BECOME_DRIVER_CARD_TITLE,
  BECOME_DRIVER_PAGE_LEAD,
  BECOME_DRIVER_PAGE_TITLE,
  BECOME_DRIVER_OFFER_KIND_LABEL,
  BECOME_DRIVER_OFFER_KIND_DESCRIPTION,
  BECOME_DRIVER_VEHICLE_SECTION_LEAD,
  BECOME_DRIVER_VEHICLE_SECTION_TITLE,
  BECOME_DRIVER_VEHICLE_CATALOG_ERROR,
  BECOME_DRIVER_SUBMIT_LABEL,
  BECOME_DRIVER_VEHICLE_ALREADY_TITLE,
  BECOME_DRIVER_VEHICLE_ALREADY_LEAD,
  BECOME_DRIVER_SETTINGS_VEHICLE_CTA,
  BECOME_DRIVER_REDIRECT_MOBILITY_TITLE,
  BECOME_DRIVER_REDIRECT_MOBILITY_BODY,
  BECOME_DRIVER_MOBILITY_DIALOG_TITLE,
  BECOME_DRIVER_MOBILITY_DIALOG_DESCRIPTION,
  BECOME_DRIVER_MOBILITY_DIALOG_PRIMARY,
  BECOME_DRIVER_MOBILITY_DIALOG_SECONDARY,
} from "@shared/become-driver-copy";
import { Button } from "@/components/ui/button";
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
import { Loader2, ArrowLeft, Car } from "lucide-react";
import { GoDriverVehicleFormGrid, goVehicleCanMarkPetFriendly } from "@/components/provider/GoDriverVehicleFormGrid";
import { GoThreeServicesReminder } from "@/components/provider/GoThreeServicesReminder";
import { useDispatchCompanyOptions } from "@/hooks/use-central";
import { GoDriverCentralAffiliationFields } from "@/components/provider/GoDriverCentralAffiliationFields";
import { useToast } from "@/hooks/use-toast";

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

type FormValues = { vehicle: VehicleFormValues };

const settingsVehicleHref = `/settings?${SETTINGS_VEHICLE_SECTION_QUERY_KEY}=1`;

const GO_MOBILITY_HREF = "/go/taxi/driver";

function BecomeDriverMobilityDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [, setLocation] = useLocation();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{BECOME_DRIVER_MOBILITY_DIALOG_TITLE}</AlertDialogTitle>
          <AlertDialogDescription>{BECOME_DRIVER_MOBILITY_DIALOG_DESCRIPTION}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel type="button" onClick={() => setLocation("/my-services")}>
            {BECOME_DRIVER_MOBILITY_DIALOG_SECONDARY}
          </AlertDialogCancel>
          <AlertDialogAction type="button" onClick={() => setLocation(GO_MOBILITY_HREF)}>
            {BECOME_DRIVER_MOBILITY_DIALOG_PRIMARY}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function BecomeDriverFormBody({
  hasPrimaryVehicle,
  provider,
  vehicleData,
  onEnrolled,
}: {
  hasPrimaryVehicle: boolean;
  provider: unknown;
  vehicleData: ProviderPrimaryVehicle | null | undefined;
  onEnrolled: () => void;
}) {
  const [, setLocation] = useLocation();
  const schema = useMemo(
    () =>
      hasPrimaryVehicle
        ? z.object({ vehicle: z.any().optional() })
        : z.object({ vehicle: insertProviderVehicleSchema }),
    [hasPrimaryVehicle]
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as any,
    defaultValues: {
      vehicle: { ...DEFAULT_VEHICLE_FORM },
    },
  });

  const vehicleType = form.watch("vehicle.vehicle_type");
  const vehicleBrand = form.watch("vehicle.brand");
  const vehicleModelWatch = form.watch("vehicle.model");

  const { data: nhtsaMakes = [], isLoading: nhtsaMakesLoading, isError: nhtsaMakesError } = useNhtsaMakes();
  const { data: nhtsaModels = [], isLoading: nhtsaModelsLoading, isError: nhtsaModelsError } = useNhtsaModelsForMake(
    hasPrimaryVehicle ? null : vehicleBrand
  );
  const { data: nhtsaYears = [], isLoading: nhtsaYearsLoading, isError: nhtsaYearsError } = useNhtsaYearsForMakeModel(
    hasPrimaryVehicle ? null : vehicleBrand,
    hasPrimaryVehicle ? null : vehicleModelWatch
  );
  const yearOptionsStrings = useMemo(() => nhtsaYears.map(String), [nhtsaYears]);

  const goOfferKind = useMemo(() => vehicleTypeToGoOfferKind(vehicleType), [vehicleType]);

  const seededRef = useRef(false);
  useEffect(() => {
    if (!provider || seededRef.current) return;
    seededRef.current = true;
    form.reset({
      vehicle: { ...DEFAULT_VEHICLE_FORM },
    });
  }, [provider, form]);

  useEffect(() => {
    if (!goVehicleCanMarkPetFriendly(String(vehicleType ?? ""))) {
      form.setValue("vehicle.is_pet_friendly", false);
    }
  }, [vehicleType, form]);

  useEffect(() => {
    if (hasPrimaryVehicle) return;
    if (!String(vehicleBrand ?? "").trim() || !String(vehicleModelWatch ?? "").trim()) {
      form.setValue("vehicle.model_year", new Date().getFullYear());
      return;
    }
    if (!nhtsaYears.length) return;
    const cur = Number(form.getValues("vehicle.model_year"));
    if (!Number.isFinite(cur) || !nhtsaYears.includes(cur)) {
      form.setValue("vehicle.model_year", nhtsaYears[0]!);
    }
  }, [hasPrimaryVehicle, vehicleBrand, vehicleModelWatch, nhtsaYears, form]);

  const enroll = useEnrollGoDriver();
  const { toast } = useToast();
  const { data: dispatchCompanies = [] } = useDispatchCompanyOptions();
  const [belongToCentral, setBelongToCentral] = useState(false);
  const [centralSearch, setCentralSearch] = useState("");
  const [pendingCentralCompanyId, setPendingCentralCompanyId] = useState<string | null>(null);

  const onSubmit = async (values: FormValues) => {
    if (belongToCentral && !pendingCentralCompanyId) {
      toast({
        variant: "destructive",
        title: "Selecciona una central",
        description: "Indica a qué empresa despachadora quieres solicitar afiliación.",
      });
      return;
    }
    await enroll.mutateAsync({
      ...(hasPrimaryVehicle ? {} : { vehicle: buildVehiclePayload(values.vehicle) }),
      ...(belongToCentral && pendingCentralCompanyId
        ? { pendingCentralCompanyId, dispatchCompanyId: null }
        : { dispatchCompanyId: null }),
    });
    onEnrolled();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{BECOME_DRIVER_CARD_TITLE}</CardTitle>
        <CardDescription>{BECOME_DRIVER_CARD_DESCRIPTION}</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            {hasPrimaryVehicle ? (
              <div className="space-y-4 rounded-lg border border-border bg-muted/25 p-4 text-sm">
                <p className="font-medium text-foreground">{BECOME_DRIVER_VEHICLE_ALREADY_TITLE}</p>
                <p>
                  <span className="text-muted-foreground">{BECOME_DRIVER_OFFER_KIND_LABEL}: </span>
                  <span className="font-medium text-foreground">
                    {GO_DRIVER_OFFER_KIND_LABELS[vehicleTypeToGoOfferKind(vehicleData?.vehicle_type)]}
                  </span>
                </p>
                <p className="mt-1 text-muted-foreground">
                  {vehicleData?.brand} {vehicleData?.model} · Placa {vehicleData?.license_plate ?? "—"} · Año{" "}
                  {vehicleData?.model_year ?? "—"}
                </p>
                <p className="text-muted-foreground">{BECOME_DRIVER_VEHICLE_ALREADY_LEAD}</p>
                <Button type="button" variant="outline" className="w-full sm:w-auto" asChild>
                  <Link href={settingsVehicleHref}>{BECOME_DRIVER_SETTINGS_VEHICLE_CTA}</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
                <GoThreeServicesReminder />

                <FormItem>
                  <FormLabel>{BECOME_DRIVER_OFFER_KIND_LABEL}</FormLabel>
                  <FormDescription className="text-xs">{BECOME_DRIVER_OFFER_KIND_DESCRIPTION}</FormDescription>
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

                <GoDriverVehicleFormGrid
                  control={form.control as unknown as Control<FieldValues>}
                  setValue={form.setValue as unknown as UseFormSetValue<FieldValues>}
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
                  sectionTitle={BECOME_DRIVER_VEHICLE_SECTION_TITLE}
                  sectionLead={BECOME_DRIVER_VEHICLE_SECTION_LEAD}
                  nhtsaErrorMessage={BECOME_DRIVER_VEHICLE_CATALOG_ERROR}
                />
              </div>
            )}

            <GoDriverCentralAffiliationFields
              companies={dispatchCompanies}
              belongToCentral={belongToCentral}
              onBelongToCentralChange={(on) => {
                setBelongToCentral(on);
                if (!on) {
                  setPendingCentralCompanyId(null);
                  setCentralSearch("");
                }
              }}
              pendingCentralCompanyId={pendingCentralCompanyId}
              onPendingCentralCompanyIdChange={setPendingCentralCompanyId}
              search={centralSearch}
              onSearchChange={setCentralSearch}
              commandListClassName="max-h-[200px]"
            />

            <Button type="submit" className="w-full sm:w-auto gap-2" disabled={enroll.isPending}>
              {enroll.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {BECOME_DRIVER_SUBMIT_LABEL}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

function RedirectNoticeCard({
  title,
  body,
  backLabel,
}: {
  title: string;
  body: string;
  backLabel: string;
}) {
  const [, setLocation] = useLocation();
  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/30 to-background py-12 px-4">
      <div className="mx-auto max-w-lg">
        <Card>
          <CardHeader>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{body}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="gap-2" onClick={() => setLocation("/my-services")}>
              <ArrowLeft className="h-4 w-4" />
              {backLabel}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
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

  const { data: categories = [] } = useCategories();
  const { data: provider, isLoading: providerLoading } = useCurrentProvider();
  const { data: vehicleData, isLoading: vehicleLoading } = useProviderVehicle({
    enabled: isAuthenticated && !!provider,
  });

  const hasPrimaryVehicle = !!vehicleData && typeof vehicleData.vehicle_type === "string";
  const ready = !authLoading && !providerLoading && (!provider || !vehicleLoading);

  const primarySlug = useMemo(
    () =>
      resolveProviderPrimaryCategorySlug(provider as { categoryId?: number | null; category?: string | null }, categories),
    [provider, categories]
  );
  const mobilityPrimary = isPrimaryMobilityProviderCategory(primarySlug);

  const goTaxi = providerHasGoBrand(provider as ProviderGoRef, "transport", categories);
  const goDelivery = providerHasGoBrand(provider as ProviderGoRef, "delivery", categories);
  const driverEnrollmentComplete = !!vehicleData && goTaxi && goDelivery;

  const [mobilityDialogOpen, setMobilityDialogOpen] = useState(false);
  const alreadyDriverDialogShown = useRef(false);

  useEffect(() => {
    if (!ready || !provider || !driverEnrollmentComplete || alreadyDriverDialogShown.current) return;
    alreadyDriverDialogShown.current = true;
    setMobilityDialogOpen(true);
  }, [ready, provider, driverEnrollmentComplete]);

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

  if (mobilityPrimary) {
    return (
      <RedirectNoticeCard
        title={BECOME_DRIVER_REDIRECT_MOBILITY_TITLE}
        body={BECOME_DRIVER_REDIRECT_MOBILITY_BODY}
        backLabel="Mis servicios"
      />
    );
  }

  if (driverEnrollmentComplete) {
    return (
      <>
        <BecomeDriverMobilityDialog open={mobilityDialogOpen} onOpenChange={setMobilityDialogOpen} />
        <div className="min-h-screen bg-gradient-to-b from-muted/30 to-background py-12 px-4 flex flex-col items-center justify-center gap-3">
          <p className="text-sm text-muted-foreground text-center max-w-md">
            Ya tienes taxi y delivery activos con vehículo registrado. Usa el diálogo para ir a Genfeb Go o vuelve a Mis
            servicios desde el menú.
          </p>
        </div>
      </>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/30 to-background py-8 px-4">
      <BecomeDriverMobilityDialog open={mobilityDialogOpen} onOpenChange={setMobilityDialogOpen} />
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
            <h1 className="font-display text-2xl font-bold tracking-tight">{BECOME_DRIVER_PAGE_TITLE}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{BECOME_DRIVER_PAGE_LEAD}</p>
          </div>
        </div>

        <BecomeDriverFormBody
          key={hasPrimaryVehicle ? "with-vehicle" : "no-vehicle"}
          hasPrimaryVehicle={hasPrimaryVehicle}
          provider={provider}
          vehicleData={vehicleData}
          onEnrolled={() => setMobilityDialogOpen(true)}
        />
      </div>
    </div>
  );
}
