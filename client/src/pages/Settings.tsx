import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, Loader2, User, Building2 } from "lucide-react";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useState } from "react";
import { useLocation } from "wouter";
import { Trash2 } from "lucide-react";
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

const profileSchema = z.object({
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
  
  const [showFirstConfirm, setShowFirstConfirm] = useState(false);
  const [showSecondConfirm, setShowSecondConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const form = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
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
      name: (u.name as string) ?? "",
      lastName: (u.lastName as string) ?? "",
      phone: (u.phone as string) ?? "",
      avatar: (u.avatar as string) ?? "",
      bankName: (u.bankName as string) ?? "",
      accountNumber: (u.accountNumber as string) ?? "",
    });
  }, [user, form.reset]);

  const onSubmit = async (data: ProfileForm) => {
    const token = localStorage.getItem("token");
    const body: Record<string, string | undefined> = {
      name: data.name || undefined,
      lastName: data.lastName || undefined,
      phone: data.phone || undefined,
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
                <span>¿Deseas eliminar tu cuenta?</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Si ya no tienes acceso a tu cuenta o deseas solicitar el borrado definitivo de tus datos personales, puedes escribirnos directamente:
              </p>
              <a 
                href="mailto:thebiglion2528@gmail.com?subject=Solicitud de eliminación de cuenta GenFeb" 
                className="block w-full p-3 text-center bg-white dark:bg-zinc-900 border border-destructive/20 rounded-lg text-destructive font-bold hover:bg-destructive/5 transition-all shadow-sm active:scale-95"
              >
                Solicitar por correo electrónico
              </a>
              <p className="text-[10px] text-center text-muted-foreground italic">
                * Tu solicitud será procesada en un plazo máximo de 48 horas hábiles.
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
          <Link href="/dashboard">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Configuración</h1>
          <p className="text-sm text-muted-foreground">Gestiona tu perfil y datos de cuenta bancaria</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Datos personales
              </CardTitle>
              <CardDescription>Nombre, contacto y avatar.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre</FormLabel>
                    <FormControl>
                      <Input placeholder="Tu nombre" {...field} />
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
                      <Input placeholder="Tu apellido" {...field} />
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
                      <Input placeholder="Ej. +593 99 123 4567" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
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

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Datos bancarios
              </CardTitle>
              <CardDescription>
                Banco y número de cuenta para retiros o pagos. Solo se permiten dígitos, espacios y guiones en el número de cuenta.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="bankName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre del banco</FormLabel>
                    <FormControl>
                      <Input placeholder="Ej. Banco Pichincha" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="accountNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Número de cuenta</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Solo dígitos, espacios o guiones"
                        {...field}
                        onChange={(e) => field.onChange(sanitizeAccountNumber(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

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
          <p className="text-sm text-muted-foreground mb-6 text-center leading-relaxed">
            Al desactivar tu cuenta, tu perfil y servicios serán eliminados de la plataforma. 
            Perderás el acceso inmediato a tu panel y balance.
          </p>
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
            <AlertDialogTitle className="text-lg font-bold">¿Eliminar cuenta?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground leading-relaxed">
              Al eliminar tu cuenta, tu perfil dejará de ser visible, se cerrará tu sesión automáticamente y perderás el acceso a tus servicios y balance actual.
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
              {((user as any)?.wallet > 0 || (user as any)?.pendingBalance > 0) ? (
                <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive font-medium text-sm">
                  Aviso: Tienes un balance de ${(Number((user as any)?.wallet || 0) + Number((user as any)?.pendingBalance || 0)).toFixed(2)}. Este saldo quedará inaccesible de inmediato.
                </div>
              ) : null}
              ¿Estás seguro de finalizar? Se cerrará tu sesión y se suspenderá tu cuenta y todo historial asociado.
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
