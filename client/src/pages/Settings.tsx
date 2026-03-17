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
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

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

  if (!isAuthenticated) {
    return (
      <div className="container max-w-lg mx-auto py-10 px-4">
        <Card>
          <CardHeader>
            <CardTitle>Configuración</CardTitle>
            <CardDescription>Inicia sesión para editar tu perfil.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/login">Iniciar sesión</Link>
            </Button>
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
    </div>
  );
}
