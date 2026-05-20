import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import type { Control, FieldValues, UseFormSetValue } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, UserPlus } from "lucide-react";
import { insertProviderVehicleSchema } from "@shared/vehicle-schema";
import { centralMemberUserFieldsSchema } from "@shared/central-member";
import {
  GO_DRIVER_OFFER_KIND_LABELS,
  goOfferKindToVehicleType,
  vehicleTypeToGoOfferKind,
  type GoDriverOfferKindSlug,
} from "@shared/go-driver-offer-kind";
import {
  BECOME_DRIVER_OFFER_KIND_DESCRIPTION,
  BECOME_DRIVER_OFFER_KIND_LABEL,
  BECOME_DRIVER_VEHICLE_CATALOG_ERROR,
  BECOME_DRIVER_VEHICLE_SECTION_LEAD,
  BECOME_DRIVER_VEHICLE_SECTION_TITLE,
} from "@shared/become-driver-copy";
import { useNhtsaMakes, useNhtsaModelsForMake, useNhtsaYearsForMakeModel } from "@/hooks/use-nhtsa-vpic";
import { useRegisterCentralMember } from "@/hooks/use-central";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GoDriverVehicleFormGrid, goVehicleCanMarkPetFriendly } from "@/components/provider/GoDriverVehicleFormGrid";
import {
  buildGoVehiclePayload,
  DEFAULT_GO_VEHICLE_FORM,
  type GoVehicleFormValues,
} from "@/lib/go-driver-vehicle-form";

const accountSchema = centralMemberUserFieldsSchema.extend({
  confirmPassword: z.string().min(6),
});

type AccountValues = z.infer<typeof accountSchema>;

type FormValues = AccountValues & {
  memberType: "central" | "driver";
  vehicle: GoVehicleFormValues;
};

type CentralMemberRegisterFormProps = {
  companyId: string;
  onRegistered?: () => void;
};

export function CentralMemberRegisterForm({ companyId, onRegistered }: CentralMemberRegisterFormProps) {
  const { toast } = useToast();
  const registerMember = useRegisterCentralMember(companyId);

  const schema = useMemo(
    () =>
      z
        .object({
          memberType: z.enum(["central", "driver"]),
          vehicle: z.any().optional(),
        })
        .merge(accountSchema)
        .superRefine((data, ctx) => {
          if (data.password !== data.confirmPassword) {
            ctx.addIssue({ code: "custom", message: "Las contraseñas no coinciden.", path: ["confirmPassword"] });
          }
          if (data.memberType === "driver") {
            const parsed = insertProviderVehicleSchema.safeParse(data.vehicle);
            if (!parsed.success) {
              for (const issue of parsed.error.issues) {
                ctx.addIssue({ ...issue, path: ["vehicle", ...(issue.path ?? [])] });
              }
            }
          }
        }),
    [],
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      memberType: "driver",
      name: "",
      lastName: "",
      email: "",
      phone: "",
      password: "",
      confirmPassword: "",
      vehicle: { ...DEFAULT_GO_VEHICLE_FORM },
    },
  });

  const memberType = form.watch("memberType");
  const vehicleType = form.watch("vehicle.vehicle_type");
  const vehicleBrand = form.watch("vehicle.brand");
  const vehicleModelWatch = form.watch("vehicle.model");

  const { data: nhtsaMakes = [], isLoading: nhtsaMakesLoading, isError: nhtsaMakesError } = useNhtsaMakes();
  const { data: nhtsaModels = [], isLoading: nhtsaModelsLoading, isError: nhtsaModelsError } = useNhtsaModelsForMake(
    memberType === "driver" ? vehicleBrand : null,
  );
  const { data: nhtsaYears = [], isLoading: nhtsaYearsLoading, isError: nhtsaYearsError } = useNhtsaYearsForMakeModel(
    memberType === "driver" ? vehicleBrand : null,
    memberType === "driver" ? vehicleModelWatch : null,
  );
  const yearOptionsStrings = useMemo(() => nhtsaYears.map(String), [nhtsaYears]);
  const goOfferKind = useMemo(() => vehicleTypeToGoOfferKind(vehicleType), [vehicleType]);

  useEffect(() => {
    if (!goVehicleCanMarkPetFriendly(String(vehicleType ?? ""))) {
      form.setValue("vehicle.is_pet_friendly", false);
    }
  }, [vehicleType, form]);

  useEffect(() => {
    if (memberType !== "driver") return;
    if (!String(vehicleBrand ?? "").trim() || !String(vehicleModelWatch ?? "").trim()) {
      form.setValue("vehicle.model_year", new Date().getFullYear());
      return;
    }
    if (!nhtsaYears.length) return;
    const cur = Number(form.getValues("vehicle.model_year"));
    if (!Number.isFinite(cur) || !nhtsaYears.includes(cur)) {
      form.setValue("vehicle.model_year", nhtsaYears[0]!);
    }
  }, [memberType, vehicleBrand, vehicleModelWatch, nhtsaYears, form]);

  const onSubmit = async (values: FormValues) => {
    try {
      await registerMember.mutateAsync({
        memberType: values.memberType,
        email: values.email.trim(),
        password: values.password,
        name: values.name.trim(),
        lastName: values.lastName.trim(),
        phone: values.phone.trim(),
        ...(values.memberType === "driver"
          ? { vehicle: buildGoVehiclePayload(values.vehicle) }
          : {}),
      });
      toast({ title: "Usuario registrado", description: "La cuenta fue creada correctamente." });
      form.reset({
        memberType: values.memberType,
        name: "",
        lastName: "",
        email: "",
        phone: "",
        password: "",
        confirmPassword: "",
        vehicle: { ...DEFAULT_GO_VEHICLE_FORM },
      });
      onRegistered?.();
    } catch (err: unknown) {
      toast({
        variant: "destructive",
        title: "Error",
        description: err instanceof Error ? err.message : "No se pudo registrar",
      });
    }
  };

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserPlus className="h-4 w-4 text-primary" />
          Registrar usuario
        </CardTitle>
        <CardDescription>
          Operadores de central o conductores con los mismos datos de vehículo que el registro Go.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="memberType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de cuenta</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="central">Operador central</SelectItem>
                      <SelectItem value="driver">Conductor (taxi + delivery)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre</FormLabel>
                    <FormControl>
                      <Input {...field} autoComplete="given-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Apellido</FormLabel>
                    <FormControl>
                      <Input {...field} autoComplete="family-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Correo</FormLabel>
                    <FormControl>
                      <Input {...field} type="email" autoComplete="email" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Teléfono</FormLabel>
                    <FormControl>
                      <Input {...field} type="tel" autoComplete="tel" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contraseña</FormLabel>
                    <FormControl>
                      <Input {...field} type="password" autoComplete="new-password" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirmar contraseña</FormLabel>
                    <FormControl>
                      <Input {...field} type="password" autoComplete="new-password" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {memberType === "driver" && (
              <div className="space-y-6 rounded-xl border border-dashed border-primary/25 bg-muted/20 p-4">
                <FormItem>
                  <FormLabel>{BECOME_DRIVER_OFFER_KIND_LABEL}</FormLabel>
                  <FormDescription className="text-xs">{BECOME_DRIVER_OFFER_KIND_DESCRIPTION}</FormDescription>
                  <Select
                    value={goOfferKind}
                    onValueChange={(v) => {
                      const kind = (v as GoDriverOfferKindSlug) ?? "carro";
                      form.setValue("vehicle.vehicle_type", goOfferKindToVehicleType(kind));
                    }}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
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

            <Button type="submit" disabled={registerMember.isPending} className="gap-2">
              {registerMember.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Registrar usuario
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
