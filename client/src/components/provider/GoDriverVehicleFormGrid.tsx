import type { Control, FieldValues, UseFormSetValue } from "react-hook-form";
import { useEffect, useMemo } from "react";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VehicleSearchCombobox } from "@/components/vehicle/VehicleSearchCombobox";
import type { VehicleType } from "@shared/vehicle-schema";

export const GO_VEHICLE_TYPE_OPTIONS: { value: VehicleType; label: string }[] = [
  { value: "motorcycle", label: "Moto" },
  { value: "car", label: "Carro" },
  { value: "pickup_truck", label: "Camioneta" },
  { value: "truck", label: "Camión" },
];

export const GO_VEHICLE_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "active", label: "Activo" },
  { value: "inactive", label: "Inactivo" },
  { value: "maintenance", label: "Mantenimiento" },
  { value: "pending_inspection", label: "Inspección pendiente" },
];

export function goVehicleCanMarkPetFriendly(vehicleType: string): boolean {
  return vehicleType === "car" || vehicleType === "pickup_truck";
}

export type GoDriverVehicleFormGridProps = {
  /** Formulario con campo anidado `vehicle`. */
  control: Control<FieldValues>;
  setValue: UseFormSetValue<FieldValues>;
  vehicleType: string | undefined;
  vehicleBrand: string | undefined;
  vehicleModelWatch: string | undefined;
  nhtsaMakes: string[];
  nhtsaMakesLoading: boolean;
  nhtsaMakesError: boolean;
  nhtsaModels: string[];
  nhtsaModelsLoading: boolean;
  nhtsaModelsError: boolean;
  nhtsaYears: number[];
  nhtsaYearsLoading: boolean;
  nhtsaYearsError: boolean;
  yearOptionsStrings: string[];
  sectionTitle: string;
  sectionLead: string;
  nhtsaErrorMessage: string;
  /** Si es true (por defecto), no se ofrece «Camión» pesado: solo moto, carro y camioneta. */
  hideTruck?: boolean;
};

export function GoDriverVehicleFormGrid({
  control,
  setValue,
  vehicleType,
  vehicleBrand,
  vehicleModelWatch,
  nhtsaMakes,
  nhtsaMakesLoading,
  nhtsaMakesError,
  nhtsaModels,
  nhtsaModelsLoading,
  nhtsaModelsError,
  nhtsaYears,
  nhtsaYearsLoading,
  nhtsaYearsError,
  yearOptionsStrings,
  sectionTitle,
  sectionLead,
  nhtsaErrorMessage,
  hideTruck = true,
}: GoDriverVehicleFormGridProps) {
  const vehicleTypeOptions = useMemo(
    () => (hideTruck ? GO_VEHICLE_TYPE_OPTIONS.filter((o) => o.value !== "truck") : [...GO_VEHICLE_TYPE_OPTIONS]),
    [hideTruck]
  );

  useEffect(() => {
    if (!hideTruck) return;
    if (vehicleType === "truck") {
      setValue("vehicle.vehicle_type", "pickup_truck");
    }
  }, [hideTruck, vehicleType, setValue]);

  const catalogError = nhtsaMakesError || nhtsaModelsError || nhtsaYearsError;

  return (
    <div className="space-y-4 rounded-lg border border-border/60 bg-muted/30 p-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{sectionTitle}</h3>
        <p className="text-xs text-muted-foreground mt-1">{sectionLead}</p>
        {catalogError ? <p className="text-xs text-destructive mt-2">{nhtsaErrorMessage}</p> : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          control={control}
          name="vehicle.vehicle_type"
          render={({ field }) => (
            <FormItem className="sm:col-span-2">
              <FormLabel>Tipo de vehículo</FormLabel>
              <Select
                onValueChange={field.onChange}
                value={field.value === "truck" ? "pickup_truck" : (field.value ?? "car")}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {vehicleTypeOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription className="text-xs">
                Seleccionado:{" "}
                <span className="font-medium text-foreground">
                  {(() => {
                    const vt = field.value === "truck" ? "pickup_truck" : (field.value ?? "car");
                    return GO_VEHICLE_TYPE_OPTIONS.find((o) => o.value === vt)?.label ?? "Carro";
                  })()}
                </span>
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="vehicle.brand"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Marca</FormLabel>
              <FormControl>
                <VehicleSearchCombobox
                  value={field.value ?? ""}
                  onChange={(v) => {
                    field.onChange(v);
                    setValue("vehicle.model", "");
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
          control={control}
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
          control={control}
          name="vehicle.model_year"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Año del vehículo</FormLabel>
              <FormDescription className="text-xs">
                Puedes escribirlo manualmente. Si el catálogo responde, verás sugerencias automáticas.
              </FormDescription>
              <FormControl>
                <>
                  <Input
                    type="number"
                    min={1980}
                    max={new Date().getFullYear() + 1}
                    inputMode="numeric"
                    list={yearOptionsStrings.length > 0 ? "vehicle-model-year-options" : undefined}
                    placeholder={
                      !String(vehicleBrand ?? "").trim() || !String(vehicleModelWatch ?? "").trim()
                        ? "Escribe el año manualmente"
                        : nhtsaYearsLoading
                          ? "Cargando sugerencias…"
                          : "Ej. 2018"
                    }
                    value={field.value == null ? "" : String(field.value)}
                    onChange={(e) => {
                      const raw = e.target.value.trim();
                      field.onChange(raw === "" ? "" : parseInt(raw, 10));
                    }}
                  />
                  {yearOptionsStrings.length > 0 ? (
                    <datalist id="vehicle-model-year-options">
                      {yearOptionsStrings.map((year) => (
                        <option key={year} value={year} />
                      ))}
                    </datalist>
                  ) : null}
                </>
              </FormControl>
              {nhtsaYearsLoading ? (
                <p className="text-xs text-muted-foreground">Cargando sugerencias de años…</p>
              ) : null}
              {!nhtsaYearsLoading &&
              String(vehicleBrand ?? "").trim() &&
              String(vehicleModelWatch ?? "").trim() &&
              yearOptionsStrings.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No se encontraron años sugeridos para esta marca y modelo. Puedes escribir el año manualmente.
                </p>
              ) : null}
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
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
          control={control}
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
                  {GO_VEHICLE_STATUS_OPTIONS.map((o) => (
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
          control={control}
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
          control={control}
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
          control={control}
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
          control={control}
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
          control={control}
          name="vehicle.is_pet_friendly"
          render={({ field }) => (
            <FormItem className="sm:col-span-2 flex flex-row items-start space-x-3 space-y-0 rounded-md border p-3">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  disabled={!goVehicleCanMarkPetFriendly(String(vehicleType ?? ""))}
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
  );
}
