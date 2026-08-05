import { useState } from "react";
import { useNoIndex } from "@/hooks/use-no-index";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, LogIn, Loader2, ShoppingBag, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { isCentralRole } from "@shared/roles";
import { CENTRAL_SETUP_PATH } from "@shared/role-change-notification";
import { isGuest } from "@/lib/auth-utils";
import { AlreadyAuthenticatedView } from "@/components/AlreadyAuthenticatedView";
import { cn } from "@/lib/utils";

const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "La contraseña es requerida"),
});

type LoginForm = z.infer<typeof loginSchema>;

const fieldClass =
  "h-11 rounded-2xl border-border/80 bg-muted/40 px-4 shadow-none focus-visible:ring-secondary dark:focus-visible:ring-primary";

export default function Login() {
  useNoIndex();
  const [showPassword, setShowPassword] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { login, isLoggingIn, user, isLoading: authLoading } = useAuth();

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = (data: LoginForm) => {
    login(data, {
      onSuccess: (result) => {
        const first = String((result.user as { name?: string }).name ?? "").trim();
        const last = String((result.user as { lastName?: string }).lastName ?? "").trim();
        const fullName = [first, last].filter(Boolean).join(" ").trim() || "Usuario";
        toast({
          title: "Bienvenido",
          description: `Hola ${fullName}, has iniciado sesión correctamente`,
        });
        const u = result.user as {
          recoveryQuestionsConfigured?: boolean;
          role?: string;
          pendingCentralSetup?: boolean;
        };
        if (u.recoveryQuestionsConfigured !== true) {
          const redirect = sessionStorage.getItem("postLoginRedirect");
          const next = redirect && redirect.startsWith("/") ? redirect : "/";
          if (redirect) sessionStorage.removeItem("postLoginRedirect");
          setLocation(`/account-recovery/setup?next=${encodeURIComponent(next)}`);
          return;
        }
        if (
          isCentralRole(u.role) &&
          (u.pendingCentralSetup === true ||
            !String((result.user as { dispatchCompanyId?: string }).dispatchCompanyId ?? "").trim())
        ) {
          setLocation(CENTRAL_SETUP_PATH);
          return;
        }
        const redirect = sessionStorage.getItem("postLoginRedirect");
        if (redirect) {
          sessionStorage.removeItem("postLoginRedirect");
          setLocation(redirect);
          return;
        }
        setLocation("/");
      },
      onError: (error: unknown) => {
        const message =
          error instanceof Error ? error.message : "Credenciales inválidas";
        toast({
          variant: "destructive",
          title: "Error",
          description: message,
        });
      },
    });
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
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
            <ShoppingBag className="h-5 w-5" strokeWidth={2.25} />
          </div>
          <p className="font-display text-3xl font-extrabold tracking-tight text-foreground">Applia</p>
          <p className="mt-0.5 text-xs font-semibold uppercase tracking-[0.2em] text-secondary dark:text-primary">
            Store
          </p>
        </div>

        <div className="rounded-[1.75rem] border border-border/70 bg-card/90 p-6 shadow-xl shadow-black/5 backdrop-blur-sm sm:p-8">
          <div className="mb-6">
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
              Inicia sesión
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Entra con tu correo y contraseña para seguir comprando.
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                          autoComplete="current-password"
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

              <Button
                type="submit"
                disabled={isLoggingIn}
                className="mt-2 h-11 w-full rounded-full text-sm font-semibold shadow-md shadow-primary/15"
              >
                {isLoggingIn ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Entrando...
                  </>
                ) : (
                  <>
                    <LogIn className="h-4 w-4" />
                    Inicia sesión
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>

              <div className="space-y-2 pt-1 text-center text-sm text-muted-foreground">
                <p>
                  <Link
                    href="/forgot-password"
                    className="font-semibold text-secondary underline-offset-4 hover:underline dark:text-primary"
                  >
                    ¿Olvidaste tu contraseña? Pulsa aquí
                  </Link>
                </p>
                <p>
                  ¿No tienes cuenta?{" "}
                  <Link
                    href="/register"
                    className="font-semibold text-secondary underline-offset-4 hover:underline dark:text-primary"
                  >
                    Regístrate
                  </Link>
                </p>
              </div>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}
