import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useSearch } from "wouter";
import { ArrowLeft, Loader2, ShoppingBag, User } from "lucide-react";
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
      accountNumber: data.accountNumber
        ? data.accountNumber.replace(/[^\d\s\-]/g, "").replace(/\s+/g, " ").trim()
        : undefined,
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
                            <Input placeholder="Ej. +58 412 123 4567" className={fieldClass} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </section>

                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <Button type="button" variant="outline" asChild className="h-11 rounded-full px-6 font-semibold">
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
