import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation, Link, useRoute } from "wouter";
import { ArrowLeft, Loader2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { hasAdminRole } from "@/lib/auth-utils";
import { AccessGateLoading } from "@/components/AccessGateLoading";

const editUserSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(100),
  lastName: z.string().min(1, "El apellido es requerido").max(100),
  email: z.string().email("Correo inválido"),
  phone: z.string().max(50).optional(),
  role: z.string().min(1, "El rol es requerido"),
  newPassword: z.string().max(100).optional().refine((v) => !v || v.length >= 6, "Mínimo 6 caracteres"),
});

type EditUserForm = z.infer<typeof editUserSchema>;

async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const token = localStorage.getItem("token");
  const res = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export default function EditUser() {
  const [, params] = useRoute("/admin/users/:id/edit");
  const id = params?.id ?? "";
  const { user: currentUser, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<{ code: string; name: string }[]>([]);

  const form = useForm<EditUserForm>({
    resolver: zodResolver(editUserSchema),
    defaultValues: {
      name: "",
      lastName: "",
      email: "",
      phone: "",
      role: "client",
      newPassword: "",
    },
  });

  useEffect(() => {
    if (authLoading) return;
    if (!hasAdminRole(currentUser)) {
      setLocation("/");
    }
  }, [authLoading, currentUser, setLocation]);

  useEffect(() => {
    if (!id) return;
    if (authLoading) return;
    if (!hasAdminRole(currentUser)) return;
    let cancelled = false;
    (async () => {
      try {
        const [userRes, rolesRes] = await Promise.all([
          fetchWithAuth(`/api/admin/users/${id}`),
          fetchWithAuth("/api/roles"),
        ]);
        if (cancelled) return;
        setRoles(rolesRes ?? []);
        form.reset({
          name: userRes.name ?? "",
          lastName: userRes.lastName ?? "",
          email: userRes.email ?? "",
          phone: userRes.phone ?? "",
          role: userRes.role ?? "client",
          newPassword: "",
        });
      } catch (e) {
        if (!cancelled) {
          toast({ variant: "destructive", title: "Error", description: "No se pudo cargar el usuario." });
          setLocation("/admin");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, authLoading, currentUser, form.reset, setLocation, toast]);

  if (authLoading) {
    return (
      <div className="container max-w-2xl py-12 px-4 flex justify-center items-center min-h-[200px]">
        <AccessGateLoading message="Cargando sesión…" className="min-h-0" />
      </div>
    );
  }
  if (!hasAdminRole(currentUser)) {
    return (
      <div className="container max-w-2xl py-12 px-4 flex justify-center items-center min-h-[200px]">
        <AccessGateLoading message="Redirigiendo al inicio…" className="min-h-0" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container max-w-2xl py-12 px-4 flex justify-center items-center min-h-[200px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  async function onSubmit(data: EditUserForm) {
    const token = localStorage.getItem("token");
    if (!token) {
      toast({ variant: "destructive", title: "Error", description: "Debes iniciar sesión" });
      return;
    }
    try {
      const body: Record<string, string> = {
        name: data.name.trim(),
        lastName: data.lastName.trim(),
        email: data.email.trim(),
        role: data.role,
      };
      if (data.phone !== undefined) body.phone = data.phone.trim();
      if (data.newPassword?.trim()) body.newPassword = data.newPassword.trim();

      await fetchWithAuth(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      toast({ title: "Usuario actualizado", description: "Los cambios se guardaron correctamente." });
      setLocation("/admin");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "No se pudo actualizar el usuario.";
      toast({ variant: "destructive", title: "Error", description: msg });
    }
  }

  return (
    <div className="container max-w-2xl py-12 px-4">
      <div className="mb-6">
        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" asChild>
          <Link href="/admin" className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Volver al panel de administración
          </Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <User className="h-6 w-6 text-primary" />
            <div>
              <CardTitle>Editar usuario</CardTitle>
              <CardDescription>
                Modifica los datos del usuario. Deja la nueva contraseña en blanco para no cambiarla.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre</FormLabel>
                    <FormControl>
                      <Input placeholder="Nombre" {...field} />
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
                      <Input placeholder="Apellido" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Correo electrónico</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="correo@ejemplo.com" {...field} />
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
                    <FormLabel>Teléfono (opcional)</FormLabel>
                    <FormControl>
                      <Input placeholder="+58 414 1234567" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rol</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar rol" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {roles.map((r) => (
                          <SelectItem key={r.code} value={r.code}>{r.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nueva contraseña (opcional)</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="Dejar en blanco para no cambiar" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  "Guardar cambios"
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
