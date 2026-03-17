import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { insertProviderSchema } from "@shared/schema";
import { type InsertProvider } from "@shared/schema";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateProvider, useCurrentProvider, useCategories } from "@/hooks/use-mango-data";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { api } from "@shared/routes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";

const becomeProFormSchema = insertProviderSchema.extend({
  categoryId: z.number().int().positive({ message: "Selecciona una categoría para tu perfil y tu servicio." }),
  category: z.string().optional(),
});
type BecomeProForm = z.infer<typeof becomeProFormSchema>;

export default function BecomePro() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { data: existingProfile, isLoading: profileLoading } = useCurrentProvider();
  const createProvider = useCreateProvider();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const { data: categories = [] } = useCategories();
  const form = useForm<BecomeProForm>({
    resolver: zodResolver(becomeProFormSchema),
    defaultValues: {
      userId: "",
      categoryId: undefined,
      category: undefined,
      profession: "",
      bio: "",
      yearsExperience: 0,
      hourlyRate: "50",
    },
  });

  useEffect(() => {
    if (user) {
      form.setValue("userId", user.id);
    }
  }, [user, form]);

  useEffect(() => {
    if (existingProfile) {
      setLocation("/professional-dashboard");
    }
  }, [existingProfile, setLocation]);

  if (authLoading || profileLoading) {
    return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin" /></div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="container max-w-md py-20 text-center">
        <h1 className="text-2xl font-bold mb-4">Inicia sesión</h1>
        <p className="mb-6 text-muted-foreground">Necesitas una cuenta para registrarte como proveedor.</p>
        <a href={api.auth.replit.login.path}>
          <Button className="w-full">Iniciar sesión / Registrarse</Button>
        </a>
      </div>
    );
  }

  function onSubmit(data: BecomeProForm) {
    const slug = data.categoryId != null ? categories?.find((c) => c.id === data.categoryId)?.slug : undefined;
    createProvider.mutate(
      {
        ...data,
        categoryId: data.categoryId,
        category: slug ?? data.category ?? undefined,
      } as InsertProvider,
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["user"] });
          queryClient.invalidateQueries({ queryKey: [api.providers.me.path] });
          queryClient.invalidateQueries({ queryKey: ["/api/me/services"] });
          setLocation("/professional-dashboard");
        },
        onError: () => {
          queryClient.invalidateQueries({ queryKey: ["user"] });
        },
      }
    );
  }

  return (
    <div className="container max-w-2xl py-12 px-4">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-display font-bold text-primary mb-2">Datos de proveedor</h1>
        <p className="text-muted-foreground">Completa tu perfil. Con estos datos se creará tu único servicio (nombre = tu nombre, descripción = tu bio, precio = tu tarifa).</p>
      </div>

      <Card className="border-border/50 shadow-xl">
        <CardHeader>
          <CardTitle>Perfil de proveedor</CardTitle>
          <CardDescription>Indica tu categoría, profesión, experiencia y tarifa. Tu servicio se publicará automáticamente.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="categoryId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Categoría de proveedor</FormLabel>
                    <Select
                      onValueChange={(v) => field.onChange(v ? Number(v) : undefined)}
                      value={field.value != null ? String(field.value) : ""}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona una categoría" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categories
                          ?.filter((cat) => cat.id != null)
                          .map((cat) => (
                            <SelectItem key={String(cat.id)} value={String(cat.id)}>
                              {cat.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
                  <FormField
                control={form.control}
                name="profession"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Profesión / Título</FormLabel>
                    <FormControl>
                      <Input placeholder="Ej. Plomero, Diseñador gráfico" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="yearsExperience"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Años de experiencia</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          {...field} 
                          onChange={e => field.onChange(parseInt(e.target.value) || 0)} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="hourlyRate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tarifa por hora (USD)</FormLabel>
                      <FormControl>
                         <Input 
                          type="number" 
                          {...field}
                         />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="bio"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descripción y habilidades</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Describe tu experiencia, certificaciones y qué ofreces. Esta descripción será la de tu servicio." 
                        className="h-32"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button 
                type="submit" 
                className="w-full text-lg h-12" 
                disabled={createProvider.isPending}
              >
                {createProvider.isPending ? "Creando perfil y servicio…" : "Crear perfil y servicio"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
