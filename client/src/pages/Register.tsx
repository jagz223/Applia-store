import { useState } from "react";
import { useNoIndex } from "@/hooks/use-no-index";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, UserPlus, Loader2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@shared/routes";
import { isGuest } from "@/lib/auth-utils";
import { AlreadyAuthenticatedView } from "@/components/AlreadyAuthenticatedView";
import { cn } from "@/lib/utils";

const registerSchema = z
  .object({
    name: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
    lastName: z.string().min(2, "El apellido debe tener al menos 2 caracteres"),
    email: z
      .string()
      .min(1, "El correo es obligatorio")
      .email("Email inválido")
      .transform((s) => s.trim().toLowerCase()),
    phone: z
      .string()
      .min(1, "El teléfono es obligatorio")
      .transform((s) => s.trim()),
    password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
    confirmPassword: z.string(),
    role: z.literal("client"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

type RegisterForm = z.infer<typeof registerSchema>;

const fieldClass =
  "h-11 rounded-2xl border-border/80 bg-muted/40 px-4 shadow-none focus-visible:ring-secondary dark:focus-visible:ring-primary";

export default function Register() {
  useNoIndex();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user, isLoading: authLoading, setUser } = useAuth();

  const form = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: "",
      lastName: "",
      email: "",
      phone: "",
      password: "",
      confirmPassword: "",
      role: "client",
    },
  });

  const onSubmit = async (data: RegisterForm) => {
    setIsLoading(true);
    try {
      const response = await fetch(api.auth.register.path, {
        method: api.auth.register.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const text = await response.text();
      let result: { message?: string; field?: string; token?: string; user?: { name?: string } };
      try {
        result = JSON.parse(text);
      } catch {
        throw new Error(`Error del servidor: ${text.substring(0, 100)}`);
      }

      if (!response.ok) {
        if (response.status === 409) {
          const msg = result.message || "Ya existe una cuenta con esos datos.";
          if (result.field === "phone") {
            form.setError("phone", { type: "manual", message: msg });
          } else {
            form.setError("email", { type: "manual", message: msg });
          }
          toast({
            variant: "destructive",
            title: "No se pudo crear la cuenta",
            description: msg,
          });
          return;
        }
        throw new Error(result.message || "Error al registrar usuario");
      }

      if (result.token) localStorage.setItem("token", result.token);
      setUser(result.user as Parameters<typeof setUser>[0]);

      toast({
        title: "Cuenta creada",
        description: `Bienvenido ${result.user?.name ?? ""}, tu cuenta está lista.`,
      });

      setLocation(`/account-recovery/setup?next=${encodeURIComponent("/")}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Error al crear la cuenta";
      toast({
        variant: "destructive",
        title: "Error",
        description: message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-[calc(100dvh-4rem)] flex-1 items-center justify-center bg-background px-4">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-secondary dark:text-primary" />
          <p className="text-sm">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!isGuest(user)) {
    return <AlreadyAuthenticatedView />;
  }

  return (
    <div
      className={cn(
        "relative flex min-h-[calc(100dvh-4rem)] flex-1 items-center justify-center overflow-hidden px-4 py-10",
        "bg-[radial-gradient(ellipse_at_20%_0%,hsl(var(--secondary)/0.14),transparent_50%),radial-gradient(ellipse_at_90%_80%,hsl(var(--primary)/0.06),transparent_45%),hsl(var(--background))]",
      )}
    >
      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex justify-center">
            <img src="/baguette-logo.png" alt="" className="h-16 w-16 object-contain" />
          </div>
          <p className="font-display text-3xl font-extrabold tracking-tight text-foreground">Baguette</p>
          <p className="mt-0.5 text-xs font-semibold uppercase tracking-[0.2em] text-secondary dark:text-primary">
            Menú
          </p>
        </div>

        <div className="rounded-[1.75rem] border border-border/70 bg-card/90 p-6 shadow-xl shadow-black/5 backdrop-blur-sm sm:p-8">
          <div className="mb-6">
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Regístrate</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Crea tu acceso para pedir en la tienda sin complicaciones.
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground">Nombre</FormLabel>
                      <FormControl>
                        <Input placeholder="Andrés" className={fieldClass} {...field} />
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
                      <FormLabel className="text-foreground">Apellido</FormLabel>
                      <FormControl>
                        <Input placeholder="Rivas" className={fieldClass} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-foreground">Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="andres.rivas@email.com"
                        className={fieldClass}
                        autoComplete="email"
                        {...field}
                      />
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
                    <FormLabel className="text-foreground">Teléfono</FormLabel>
                    <FormControl>
                      <Input
                        type="tel"
                        placeholder="+58 412 123 4567"
                        className={fieldClass}
                        autoComplete="tel"
                        {...field}
                      />
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
                    <FormLabel className="text-foreground">Contraseña</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type={showPassword ? "text" : "password"}
                          placeholder="••••••••"
                          className={cn(fieldClass, "pr-11")}
                          autoComplete="new-password"
                          {...field}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full hover:bg-transparent"
                          onClick={() => setShowPassword(!showPassword)}
                          aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <Eye className="h-4 w-4 text-muted-foreground" />
                          )}
                        </Button>
                      </div>
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
                    <FormLabel className="text-foreground">Confirmar contraseña</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="••••••••"
                        className={fieldClass}
                        autoComplete="new-password"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                disabled={isLoading}
                className="mt-2 h-11 w-full rounded-full text-sm font-semibold shadow-md shadow-primary/15"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creando cuenta...
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4" />
                    Regístrate
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>

              <p className="pt-1 text-center text-sm text-muted-foreground">
                ¿Ya estás registrado?{" "}
                <Link
                  href="/login"
                  className="font-semibold text-secondary underline-offset-4 hover:underline dark:text-primary"
                >
                  Entra aquí
                </Link>
              </p>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}
