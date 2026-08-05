import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearch } from "wouter";
import { ArrowLeft, Car, Loader2, ShoppingBag, User } from "lucide-react";
import { isGoVehicleProvider } from "@shared/provider-car-go";
import { SETTINGS_VEHICLE_SECTION_QUERY_KEY } from "@shared/settings-notification-urls";
import { useCategories, useCurrentProvider } from "@/hooks/use-mango-data";
import { resolveVehicleKind } from "@/components/driver/cargo-map-markers";
import { ProviderVehicleChangeRequestDialog } from "@/components/provider/ProviderVehicleChangeRequestDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { ThemeAppearanceCard } from "@/components/ThemeAppearanceCard";
import { SettingsChangePasswordCard } from "@/components/settings/SettingsChangePasswordCard";
import { cn } from "@/lib/utils";
import { getPrimaryStoreVitrinaHref, usePrimaryStore } from "@/hooks/use-primary-store";

function sanitizeAccountNumber(value: string): string {
  return value.replace(/[^\d\s\-]/g, "").replace(/\s+/g, " ").trim();
}

const GO_VEHICLE_TYPE_LABELS: Record<string, string> = {
  motorcycle: "Moto",
  car: "Carro",
  pickup_truck: "Camioneta",
  truck: "Camión",
};

function isMeaningfulProviderVehicleRow(row: Record<string, unknown> | null | undefined): boolean {
  if (!row) return false;
  return Boolean(
    (row.license_plate && String(row.license_plate).trim()) ||
      (row.brand && String(row.brand).trim()) ||
      (row.model && String(row.model).trim()) ||
      (row.vehicle_type && String(row.vehicle_type).trim()),
  );
}

const profileSchema = z.object({
  email: z.string().email("Correo inválido").optional().or(z.literal("")),
  name: z.string().min(2, "Mínimo 2 caracteres").max(100).optional().or(z.literal("")),
  lastName: z.string().min(2, "Mínimo 2 caracteres").max(100).optional().or(z.literal("")),
  phone: z.string().max(50).optional(),
  bankName: z.string().max(120).optional(),
  accountNumber: z
    .string()
    .max(40)
    .optional()
    .refine((v) => !v || /^[\d\s\-]*$/.test(v), "Solo dígitos, espacios y guiones"),
});

type ProfileForm = z.infer<typeof profileSchema>;

const fieldClass =
  "h-11 rounded-2xl border-border/80 bg-muted/40 px-4 shadow-none focus-visible:ring-secondary dark:focus-visible:ring-primary";

const panelClass =
  "rounded-[1.5rem] border border-border/70 bg-card/90 p-5 shadow-sm backdrop-blur-sm sm:p-6";

export default function Settings() {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const searchQs = useSearch();
  const { data: primaryStore } = usePrimaryStore(isAuthenticated);
  const tiendaHref = getPrimaryStoreVitrinaHref(primaryStore);

  const settingsBackHref = useMemo(() => {
    try {
      const qp = new URLSearchParams(searchQs || "");
      const raw = qp.get("return");
      if (!raw) return tiendaHref;
      let decoded = raw;
      try {
        decoded = decodeURIComponent(raw);
      } catch {
        /* noop */
      }
      if (typeof decoded === "string" && decoded.startsWith("/") && !decoded.startsWith("//")) {
        return decoded;
      }
    } catch {
      /* noop */
    }
    return tiendaHref;
  }, [searchQs, tiendaHref]);

  const [vehicleChangeOpen, setVehicleChangeOpen] = useState(false);
  const vehicleSettingsSectionRef = useRef<HTMLDivElement | null>(null);
  const [vehicleSectionHighlight, setVehicleSectionHighlight] = useState(false);

  const isProfessional = (user as { role?: string } | null)?.role === "professional";
  const { data: provider, isLoading: providerLoading, isError: providerError } = useCurrentProvider();
  const { data: categories = [] } = useCategories();

  const { data: providerVehicleRow, isLoading: providerVehicleLoading } = useQuery({
    queryKey: ["/api/me/provider-vehicle"],
    queryFn: async () => {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/me/provider-vehicle", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.status === 401) return null;
      if (!res.ok) return null;
      return res.json() as Promise<Record<string, unknown> | null>;
    },
    enabled: isAuthenticated && isProfessional && provider != null && !providerLoading && !providerError,
  });

  const showGoVehicleCard =
    isProfessional &&
    !providerLoading &&
    !providerError &&
    provider != null &&
    (isGoVehicleProvider(provider, categories) ||
      (!providerVehicleLoading && isMeaningfulProviderVehicleRow(providerVehicleRow as Record<string, unknown>)));

  const openVehicleSectionFromNotification = useMemo(() => {
    try {
      return new URLSearchParams(searchQs || "").get(SETTINGS_VEHICLE_SECTION_QUERY_KEY) === "1";
    } catch {
      return false;
    }
  }, [searchQs]);

  useEffect(() => {
    if (!openVehicleSectionFromNotification || !showGoVehicleCard) return;
    if (providerVehicleLoading) return;
    const el = vehicleSettingsSectionRef.current;
    if (!el) return;
    const scrollTimer = window.setTimeout(() => {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setVehicleSectionHighlight(true);
    }, 250);
    const unhighlightTimer = window.setTimeout(() => setVehicleSectionHighlight(false), 5200);
    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(unhighlightTimer);
    };
  }, [openVehicleSectionFromNotification, showGoVehicleCard, providerVehicleLoading]);

  const form = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      email: "",
      name: "",
      lastName: "",
      phone: "",
      bankName: "",
      accountNumber: "",
    },
  });

  useEffect(() => {
    if (!user) return;
    const u = user as Record<string, unknown>;
    form.reset({
      email: (u.email as string) ?? "",
      name: (u.name as string) ?? "",
      lastName: (u.lastName as string) ?? "",
      phone: (u.phone as string) ?? "",
      bankName: (u.bankName as string) ?? "",
      accountNumber: (u.accountNumber as string) ?? "",
    });
  }, [user, form.reset]);

  const recoveryConfigured =
    (user as { recoveryQuestionsConfigured?: boolean } | null)?.recoveryQuestionsConfigured === true;

  const doSubmit = async (data: ProfileForm) => {
    const token = localStorage.getItem("token");
    const body: Record<string, string | undefined> = {
      name: data.name || undefined,
      lastName: data.lastName || undefined,
      phone: data.phone || undefined,
      bankName: data.bankName || undefined,
      accountNumber: data.accountNumber ? sanitizeAccountNumber(data.accountNumber) : undefined,
    };
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Error al guardar");
      }
      const { user: updatedUser } = await res.json();
      queryClient.setQueryData(["user"], updatedUser);
      toast({ title: "Guardado", description: "Tus datos quedaron actualizados." });
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "No se pudo guardar",
        description: e instanceof Error ? e.message : "Inténtalo otra vez en un momento.",
      });
    }
  };

  if (!isAuthenticated) {
    return (
      <div
        className={cn(
          "flex min-h-[calc(100dvh-4rem)] flex-1 items-center justify-center px-4 py-10",
          "bg-[radial-gradient(ellipse_at_20%_0%,hsl(var(--secondary)/0.14),transparent_50%),radial-gradient(ellipse_at_90%_80%,hsl(var(--primary)/0.06),transparent_45%),hsl(var(--background))]",
        )}
      >
        <div className="w-full max-w-md rounded-[1.75rem] border border-border/70 bg-card/90 p-8 text-center shadow-xl shadow-black/5 backdrop-blur-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <ShoppingBag className="h-5 w-5" strokeWidth={2.25} />
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Tu cuenta</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Entra para ver y editar tus datos en Applia Store.
          </p>
          <Button asChild className="mt-6 h-11 w-full rounded-full font-semibold">
            <Link href="/login">Iniciar sesión</Link>
          </Button>
          <p className="mt-4 text-sm text-muted-foreground">
            ¿No tienes cuenta?{" "}
            <Link
              href="/register"
              className="font-semibold text-secondary underline-offset-4 hover:underline dark:text-primary"
            >
              Crear una
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative flex min-h-[calc(100dvh-4rem)] flex-1 flex-col",
        "bg-[radial-gradient(ellipse_at_15%_0%,hsl(var(--secondary)/0.12),transparent_45%),radial-gradient(ellipse_at_85%_20%,hsl(var(--primary)/0.05),transparent_40%),hsl(var(--background))]",
      )}
    >
      <div className="mx-auto w-full max-w-[100rem] flex-1 px-4 py-8 min-[400px]:px-6 sm:px-8 lg:px-10">
        <div className="mb-8 flex items-start gap-3 sm:items-center sm:gap-4">
          <Button
            variant="outline"
            size="icon"
            asChild
            className="mt-0.5 h-10 w-10 shrink-0 rounded-full border-border/80"
          >
            <Link href={settingsBackHref} aria-label="Volver">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-secondary dark:text-primary">
              Applia Store
            </p>
            <h1 className="font-display text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
              Mi cuenta
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Datos de contacto, acceso y cómo se ve la app.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12 lg:gap-8">
          <aside className="flex flex-col gap-5 lg:col-span-4 lg:sticky lg:top-24 lg:self-start">
            <ThemeAppearanceCard />
            <SettingsChangePasswordCard recoveryConfigured={recoveryConfigured} />
          </aside>

          <div className="flex min-w-0 flex-col gap-5 lg:col-span-8">
            {showGoVehicleCard ? (
              <>
                <div
                  ref={vehicleSettingsSectionRef}
                  className={cn(
                    "scroll-mt-24 transition-shadow duration-300",
                    vehicleSectionHighlight && "rounded-[1.5rem] ring-2 ring-primary ring-offset-2 ring-offset-background",
                  )}
                >
                  <section className={panelClass}>
                    <div className="mb-4 flex items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                        <Car className="h-4 w-4" aria-hidden />
                      </span>
                      <div className="min-w-0">
                        <h2 className="font-display text-base font-bold tracking-tight text-foreground">
                          Tu unidad
                        </h2>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          Si cambias de vehículo o modalidad, envía una solicitud para revisión.
                        </p>
                      </div>
                    </div>
                    <div className="space-y-4 lg:flex lg:items-end lg:justify-between lg:gap-6 lg:space-y-0">
                      <div className="min-w-0 flex-1 text-sm">
                        {providerVehicleLoading ? (
                          <p className="flex items-center gap-2 text-muted-foreground">
                            <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                            Cargando unidad…
                          </p>
                        ) : providerVehicleRow &&
                          (providerVehicleRow.license_plate ||
                            providerVehicleRow.brand ||
                            providerVehicleRow.model ||
                            providerVehicleRow.vehicle_type) ? (
                          <div className="space-y-2 rounded-2xl border border-border/60 bg-muted/25 p-4">
                            <p>
                              <span className="text-muted-foreground">Tipo:</span>{" "}
                              <span className="font-semibold text-foreground">
                                {GO_VEHICLE_TYPE_LABELS[
                                  resolveVehicleKind(providerVehicleRow.vehicle_type as string | undefined)
                                ] ?? "Vehículo"}
                              </span>
                            </p>
                            {(String(providerVehicleRow.brand ?? "").trim() ||
                              String(providerVehicleRow.model ?? "").trim()) && (
                              <p>
                                <span className="text-muted-foreground">Unidad:</span>{" "}
                                <span className="font-semibold text-foreground">
                                  {[providerVehicleRow.brand, providerVehicleRow.model]
                                    .filter(Boolean)
                                    .join(" ")}
                                  {providerVehicleRow.model_year != null
                                    ? ` · ${String(providerVehicleRow.model_year)}`
                                    : ""}
                                </span>
                              </p>
                            )}
                            {providerVehicleRow.license_plate ? (
                              <p>
                                <span className="text-muted-foreground">Placa:</span>{" "}
                                <span className="font-mono font-semibold">
                                  {String(providerVehicleRow.license_plate)}
                                </span>
                              </p>
                            ) : null}
                          </div>
                        ) : (
                          <p className="text-muted-foreground">
                            Todavía no hay unidad registrada. Completa la solicitud para operar con normalidad.
                          </p>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 w-full shrink-0 rounded-full px-5 font-semibold lg:w-auto"
                        onClick={() => setVehicleChangeOpen(true)}
                      >
                        Solicitar cambio
                      </Button>
                    </div>
                  </section>
                </div>
                <ProviderVehicleChangeRequestDialog
                  open={vehicleChangeOpen}
                  onOpenChange={setVehicleChangeOpen}
                  vehicleRow={providerVehicleRow ?? null}
                />
              </>
            ) : null}

            <Form {...form}>
              <form onSubmit={form.handleSubmit(doSubmit)} className="space-y-5">
                <section className={panelClass}>
                  <div className="mb-5 flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground dark:bg-primary dark:text-primary-foreground">
                      <User className="h-4 w-4" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <h2 className="font-display text-base font-bold tracking-tight text-foreground">
                        Datos de contacto
                      </h2>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        Nombre y teléfono los puedes editar cuando quieras. El correo queda fijo.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem className="sm:col-span-2">
                          <FormLabel>Correo</FormLabel>
                          <FormControl>
                            <Input
                              type="email"
                              className={cn(fieldClass, "opacity-80")}
                              {...field}
                              disabled
                              readOnly
                            />
                          </FormControl>
                          <FormMessage />
                          <p className="text-xs text-muted-foreground">No editable desde la cuenta.</p>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nombre</FormLabel>
                          <FormControl>
                            <Input placeholder="Tu nombre" className={fieldClass} {...field} />
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
                            <Input placeholder="Tu apellido" className={fieldClass} {...field} />
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
                            <Input
                              placeholder="Ej. +58 412 123 4567"
                              className={fieldClass}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </section>

                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    asChild
                    className="h-11 rounded-full px-6 font-semibold"
                  >
                    <Link href={tiendaHref}>Volver a la tienda</Link>
                  </Button>
                  <Button
                    type="submit"
                    disabled={form.formState.isSubmitting}
                    className="h-11 rounded-full px-6 font-semibold shadow-md shadow-primary/15"
                  >
                    {form.formState.isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Guardando…
                      </>
                    ) : (
                      "Guardar cambios"
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </div>
        </div>
      </div>
    </div>
  );
}
