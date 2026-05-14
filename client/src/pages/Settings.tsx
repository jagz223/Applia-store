import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useSearch } from "wouter";
import { ArrowLeft, Car, Loader2, User, Building2, Trash2 } from "lucide-react";
import { isGoVehicleProvider } from "@shared/provider-car-go";
import { SETTINGS_VEHICLE_SECTION_QUERY_KEY } from "@shared/settings-notification-urls";
import { useCategories, useCurrentProvider } from "@/hooks/use-mango-data";
import { resolveVehicleKind } from "@/components/driver/cargo-map-markers";
import { ProviderVehicleChangeRequestDialog } from "@/components/provider/ProviderVehicleChangeRequestDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { ThemeAppearanceCard } from "@/components/ThemeAppearanceCard";
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

/** Solo permite dígitos, espacios y guiones en número de cuenta. */
function sanitizeAccountNumber(value: string): string {
  return value.replace(/[^\d\s\-]/g, "").replace(/\s+/g, " ").trim();
}

/** Etiqueta corta para tipo de unidad en resúmenes de configuración. */
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
      (row.vehicle_type && String(row.vehicle_type).trim())
  );
}

const profileSchema = z.object({
  email: z.string().email("Correo inválido").optional().or(z.literal("")),
  name: z.string().min(2, "Mínimo 2 caracteres").max(100).optional().or(z.literal("")),
  lastName: z.string().min(2, "Mínimo 2 caracteres").max(100).optional().or(z.literal("")),
  phone: z.string().max(50).optional(),
  avatar: z.string().url("URL inválida").optional().or(z.literal("")),
  bankName: z.string().max(120).optional(),
  accountNumber: z
    .string()
    .max(40)
    .optional()
    .refine((v) => !v || /^[\d\s\-]*$/.test(v), "Solo dígitos, espacios y guiones"),
});

type ProfileForm = z.infer<typeof profileSchema>;

export default function Settings() {
  const { user, isAuthenticated, logout } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const searchQs = useSearch();
  const settingsBackHref = useMemo(() => {
    try {
      const qp = new URLSearchParams(searchQs || "");
      const raw = qp.get("return");
      if (!raw) return "/dashboard";
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
    return "/dashboard";
  }, [searchQs]);
  
  const [showFirstConfirm, setShowFirstConfirm] = useState(false);
  const [showSecondConfirm, setShowSecondConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [pendingSensitiveSave, setPendingSensitiveSave] = useState<ProfileForm | null>(null);
  const [changeReqField, setChangeReqField] = useState<"email" | "name" | "phone">("phone");
  const [changeReqReason, setChangeReqReason] = useState("");
  const [isSendingRequest, setIsSendingRequest] = useState(false);
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
      avatar: "",
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
      avatar: (u.avatar as string) ?? "",
      bankName: (u.bankName as string) ?? "",
      accountNumber: (u.accountNumber as string) ?? "",
    });
  }, [user, form.reset]);

  const grants = useMemo(() => {
    const g = (user as any)?.profileEditGrants ?? {};
    return {
      email: g.email === true,
      name: g.name === true,
      phone: g.phone === true,
    };
  }, [user]);

  const doSubmit = async (data: ProfileForm) => {
    const token = localStorage.getItem("token");
    const body: Record<string, string | undefined> = {
      email: grants.email ? (data.email || undefined) : undefined,
      name: grants.name ? (data.name || undefined) : undefined,
      lastName: grants.name ? (data.lastName || undefined) : undefined,
      phone: grants.phone ? (data.phone || undefined) : undefined,
      avatar: data.avatar || undefined,
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
      toast({ title: "Perfil actualizado", description: "Los datos se guardaron correctamente." });
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Error",
        description: e instanceof Error ? e.message : "No se pudo actualizar el perfil.",
      });
    }
  };

  const onSubmit = async (data: ProfileForm) => {
    const sensitive =
      (grants.email && (data.email ?? "").trim() !== String((user as any)?.email ?? "").trim()) ||
      (grants.name &&
        (((data.name ?? "").trim() !== String((user as any)?.name ?? "").trim()) ||
          ((data.lastName ?? "").trim() !== String((user as any)?.lastName ?? "").trim()))) ||
      (grants.phone && (data.phone ?? "").trim() !== String((user as any)?.phone ?? "").trim());

    if (sensitive) {
      setPendingSensitiveSave(data);
      return;
    }
    await doSubmit(data);
  };

  const sendChangeRequest = async () => {
    const token = localStorage.getItem("token");
    const reason = changeReqReason.trim();
    if (!reason) {
      toast({ variant: "destructive", title: "Motivo requerido", description: "Escribe un motivo corto para tu solicitud." });
      return;
    }
    setIsSendingRequest(true);
    try {
      const res = await fetch("/api/me/account-change-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ field: changeReqField, reason }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "No se pudo enviar la petición");
      }
      setChangeReqReason("");
      toast({ title: "Petición enviada", description: "Un administrador revisará tu solicitud." });
    } catch (e: unknown) {
      toast({ variant: "destructive", title: "Error", description: e instanceof Error ? e.message : "No se pudo enviar la petición." });
    } finally {
      setIsSendingRequest(false);
    }
  };

  const onDeleteAccount = async () => {
    setIsDeleting(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch("/api/auth/account", {
        method: "DELETE",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Error al eliminar la cuenta");
      }
      
      toast({ 
        title: "Cuenta eliminada", 
        description: "Tu cuenta ha sido eliminada. Te esperamos luego en GenFeb para que sigas recibiendo y brindando los mejores servicios." 
      });
      
      // Cerrar sesión y redirigir
      await logout();
      setLocation("/");
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Error",
        description: e instanceof Error ? e.message : "No se pudo eliminar la cuenta.",
      });
      setIsDeleting(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="container max-w-lg mx-auto py-10 px-4">
        <Card className="border-none shadow-2xl bg-gradient-to-b from-background to-muted/20">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-12 h-12 bg-mango-orange/10 rounded-full flex items-center justify-center mb-4">
              <User className="h-6 w-6 text-mango-orange" />
            </div>
            <CardTitle className="text-2xl font-bold">Configuración</CardTitle>
            <CardDescription className="text-base">
              Inicia sesión para gestionar tu perfil y preferencias.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-4">
            <Button asChild className="w-full h-12 text-lg font-semibold shadow-mango-orange/20 shadow-lg">
              <Link href="/login">Iniciar sesión</Link>
            </Button>
            
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-muted" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground font-medium">O otras acciones</span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-destructive/5 border border-destructive/10 space-y-3">
              <div className="flex items-center gap-2 text-destructive font-semibold">
                <Trash2 className="h-4 w-4" />
                <span>Eliminación de cuenta en GenFeb</span>
              </div>
              <div className="text-sm text-muted-foreground leading-relaxed space-y-2">
                <p>
                  Pasos para solicitar la eliminación permanente de tu cuenta sin iniciar sesión:
                </p>
                <ol className="list-decimal list-inside ml-1 text-xs space-y-1">
                  <li>Haz clic en el botón de abajo.</li>
                  <li>Envía el correo usando la misma dirección de email con la que te registraste.</li>
                </ol>
                <div className="text-xs bg-muted/50 p-2 rounded mt-2">
                  <strong>Qué se borrará:</strong> Todo tu perfil, avatar, ubicación e historial de mensajes.<br/>
                  <strong>Qué se conservará:</strong> Datos de facturas y reservas pasadas se mantienen por 12 meses para fines contables y prevención de fraude.
                </div>
              </div>
              <a 
                href="mailto:thebiglion2528@gmail.com?subject=Solicitud de eliminación de cuenta GenFeb" 
                className="block w-full p-3 text-center bg-white dark:bg-zinc-900 border border-destructive/20 rounded-lg text-destructive font-bold hover:bg-destructive/5 transition-all shadow-sm active:scale-95 mt-4"
              >
                Solicitar por correo electrónico
              </a>
              <p className="text-[10px] text-center text-muted-foreground italic">
                * Tu solicitud de borrado será procesada en un plazo máximo de 48 horas hábiles.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-lg mx-auto py-8 px-4">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" asChild>
          <Link href={settingsBackHref}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Configuración</h1>
          <p className="text-sm text-muted-foreground">Gestiona tu perfil y preferencias</p>
        </div>
      </div>

      <ThemeAppearanceCard className="mb-6" />

      {showGoVehicleCard ? (
        <>
          <div
            ref={vehicleSettingsSectionRef}
            className={`mb-6 scroll-mt-24 rounded-xl transition-shadow duration-300 ${
              vehicleSectionHighlight ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""
            }`}
          >
            <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Car className="h-5 w-5" />
                Tu vehículo (taxi / delivery / marketplace)
              </CardTitle>
              <CardDescription>
                Si cambias de moto, carro o modalidad (taxi / delivery / marketplace), envía una solicitud. Un administrador debe
                aprobarla antes de que quede registrada, igual que con el cambio de datos de cuenta.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {providerVehicleLoading ? (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  Cargando datos del vehículo…
                </p>
              ) : providerVehicleRow &&
                (providerVehicleRow.license_plate ||
                  providerVehicleRow.brand ||
                  providerVehicleRow.model ||
                  providerVehicleRow.vehicle_type) ? (
                <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
                  <p>
                    <span className="text-muted-foreground">Tipo:</span>{" "}
                    <span className="font-medium text-foreground">
                      {GO_VEHICLE_TYPE_LABELS[
                        resolveVehicleKind(providerVehicleRow.vehicle_type as string | undefined)
                      ] ?? "Vehículo"}
                    </span>
                  </p>
                  {(String(providerVehicleRow.brand ?? "").trim() ||
                    String(providerVehicleRow.model ?? "").trim()) ? (
                    <p>
                      <span className="text-muted-foreground">Unidad:</span>{" "}
                      <span className="font-medium text-foreground">
                        {[providerVehicleRow.brand, providerVehicleRow.model].filter(Boolean).join(" ")}
                        {providerVehicleRow.model_year != null ? ` · ${String(providerVehicleRow.model_year)}` : ""}
                      </span>
                    </p>
                  ) : null}
                  {providerVehicleRow.license_plate ? (
                    <p>
                      <span className="text-muted-foreground">Placa:</span>{" "}
                      <span className="font-mono font-medium">{String(providerVehicleRow.license_plate)}</span>
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="text-muted-foreground">
                  Aún no hay un vehículo registrado o faltan datos. Completa la solicitud para que el equipo pueda
                  validar tu unidad y puedas operar con normalidad.
                </p>
              )}
              <Button type="button" variant="outline" className="w-full" onClick={() => setVehicleChangeOpen(true)}>
                Solicitar cambio de vehículo
              </Button>
            </CardContent>
          </Card>
          </div>
          <ProviderVehicleChangeRequestDialog
            open={vehicleChangeOpen}
            onOpenChange={setVehicleChangeOpen}
            vehicleRow={providerVehicleRow ?? null}
          />
        </>
      ) : null}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Datos personales
              </CardTitle>
              <CardDescription>
                Correo, nombre y teléfono se muestran aquí. Para cambiarlos necesitas una petición aprobada.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Correo</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="Tu correo"
                        {...field}
                        disabled={!grants.email}
                      />
                    </FormControl>
                    <FormMessage />
                    {!grants.email ? (
                      <p className="text-xs text-muted-foreground">Bloqueado. Envía una petición para poder cambiarlo.</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">Aprobado: puedes cambiarlo ahora y guardar.</p>
                    )}
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
                      <Input placeholder="Tu nombre" {...field} disabled={!grants.name} />
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
                      <Input placeholder="Tu apellido" {...field} disabled={!grants.name} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Teléfono</FormLabel>
                    <FormControl>
                      <Input placeholder="Ej. +593 99 123 4567" {...field} disabled={!grants.phone} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {!grants.name || !grants.phone || !grants.email ? (
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-sm font-medium">Solicitar cambio de datos</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Selecciona qué dato quieres cambiar y explica brevemente el motivo. Un admin revisará la solicitud.
                  </p>
                  <div className="mt-3 grid grid-cols-1 gap-3">
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">Quiero cambiar</p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant={changeReqField === "phone" ? "default" : "outline"}
                          size="sm"
                          onClick={() => setChangeReqField("phone")}
                        >
                          Teléfono
                        </Button>
                        <Button
                          type="button"
                          variant={changeReqField === "name" ? "default" : "outline"}
                          size="sm"
                          onClick={() => setChangeReqField("name")}
                        >
                          Nombre
                        </Button>
                        <Button
                          type="button"
                          variant={changeReqField === "email" ? "default" : "outline"}
                          size="sm"
                          onClick={() => setChangeReqField("email")}
                        >
                          Correo
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">Motivo (corto)</p>
                      <Textarea
                        value={changeReqReason}
                        onChange={(e) => setChangeReqReason(e.target.value)}
                        rows={3}
                        placeholder="Ej.: Cambié de número por pérdida del chip…"
                      />
                    </div>
                    <div className="flex justify-end">
                      <Button type="button" onClick={sendChangeRequest} disabled={isSendingRequest}>
                        {isSendingRequest ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Enviando…
                          </>
                        ) : (
                          "Enviar petición"
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
              <FormField
                control={form.control}
                name="avatar"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>URL del avatar (opcional)</FormLabel>
                    <FormControl>
                      <Input placeholder="https://..." type="url" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Sección banco oculta temporalmente */}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" asChild>
              <Link href="/dashboard">Cancelar</Link>
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
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

      {/* Confirmación: cambios sensibles (una sola vez) */}
      <AlertDialog
        open={pendingSensitiveSave != null}
        onOpenChange={(open) => {
          if (!open) setPendingSensitiveSave(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Guardar cambio de dato de cuenta</AlertDialogTitle>
            <AlertDialogDescription>
              Este cambio no se podrá volver a modificar después. Si necesitas otro cambio, tendrás que enviar una nueva petición.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                const data = pendingSensitiveSave;
                setPendingSensitiveSave(null);
                if (data) void doSubmit(data);
              }}
            >
              Guardar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card className="mt-12 border-destructive/20 shadow-sm transition-all hover:shadow-md bg-destructive/5">
        <CardHeader>
          <CardTitle className="text-destructive flex items-center gap-2">
            <Trash2 className="h-5 w-5" />
            Zona de Peligro
          </CardTitle>
          <CardDescription>
            Acciones permanentes sobre tu cuenta.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center">
          <div className="text-sm text-muted-foreground mb-6 leading-relaxed space-y-3 w-full max-w-lg">
            <p className="text-center font-medium">
              Perderás el acceso inmediato a tu panel.
            </p>
            <div className="bg-destructive/10 p-3 rounded-lg border border-destructive/20 text-xs text-left">
              <strong>Qué se borrará:</strong> Todo tu perfil, avatar, ubicación e historial de mensajes.<br/>
              <strong className="mt-2 block">Qué se conservará:</strong> Datos de facturas y reservas pasadas se mantienen por 12 meses por obligaciones fiscales y prevención de fraude en Ecuador.
            </div>
            <p className="text-xs text-center text-destructive">
              * Para proceder de forma permanente, haz clic en el botón inferior. La suspensión es inmediata.
            </p>
          </div>
          <Button 
            variant="destructive" 
            onClick={() => setShowFirstConfirm(true)}
            className="w-full sm:w-auto bg-destructive hover:bg-destructive/90 text-white font-medium px-8 h-12 rounded-lg shadow-lg shadow-destructive/20"
          >
            Eliminar mi cuenta
          </Button>
        </CardContent>
      </Card>

      {/* Primer Pop-up de Confirmación */}
      <AlertDialog open={showFirstConfirm} onOpenChange={setShowFirstConfirm}>
        <AlertDialogContent className="rounded-xl border-destructive/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-bold">Solicitud de borrado de cuenta</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground leading-relaxed">
              Recuerda que al proceder, tu perfil, fotos e historial de chats serán borrados permanentemente. Por normativas legales, los datos de facturas y reservas pasadas se conservarán temporalmente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-6">
            <AlertDialogCancel className="rounded-lg">Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                setShowFirstConfirm(false);
                setShowSecondConfirm(true);
              }}
              className="bg-destructive hover:bg-destructive/90 text-white rounded-lg px-6"
            >
              Continuar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Segundo Pop-up de Confirmación (Explícito) */}
      <AlertDialog open={showSecondConfirm} onOpenChange={setShowSecondConfirm}>
        <AlertDialogContent className="rounded-xl border-destructive/20 shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive text-lg font-bold">Confirmación Final</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground leading-relaxed">
              ¿Estás seguro de finalizar? Todo el proceso de borrado comenzará de forma inmediata y perderás el acceso permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-6">
            <AlertDialogCancel disabled={isDeleting} className="rounded-lg">Regresar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={(e) => {
                e.preventDefault();
                onDeleteAccount();
              }}
              disabled={isDeleting}
              className="bg-destructive hover:bg-destructive/90 text-white rounded-lg font-bold px-8 shadow-lg shadow-destructive/20"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Desactivando...
                </>
              ) : (
                "Confirmar desactivación"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
