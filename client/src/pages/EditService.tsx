import { useEffect } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useService, useUpdateService, useCurrentProvider } from "@/hooks/use-mango-data";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ArrowLeft } from "lucide-react";

const editServiceSchema = z.object({
  title: z.string().min(1, "El nombre es obligatorio").max(500),
  description: z.string().max(5000).optional(),
  price: z.string().min(1, "El precio es obligatorio"),
  // imageUrl existe en el backend, pero ya no se configura desde la UI.
  imageUrl: z.string().url("URL no válida").optional().or(z.literal("")),
});

type EditServiceForm = z.infer<typeof editServiceSchema>;

export default function EditService() {
  const [, params] = useRoute("/edit-service/:id");
  const [, setLocation] = useLocation();
  const id = parseInt(params?.id || "0", 10);
  const { data: service, isLoading: serviceLoading } = useService(id);
  const { data: provider } = useCurrentProvider();
  const { user } = useAuth();
  const updateService = useUpdateService(id);

  const form = useForm<EditServiceForm>({
    resolver: zodResolver(editServiceSchema),
    defaultValues: {
      title: "",
      description: "",
      price: "0",
      imageUrl: "",
    },
  });

  useEffect(() => {
    if (service) {
      form.reset({
        title: service.title ?? "",
        description: service.description ?? "",
        price: String(service.price ?? "0"),
        imageUrl: service.imageUrl ?? "",
      });
    }
  }, [service, form]);

  const isOwner = provider && service && service.providerId === provider.id;

  const onSubmit = (data: EditServiceForm) => {
    updateService.mutate(
      {
        title: data.title,
        description: data.description ?? "",
        price: data.price,
        // No permitimos configurar desde UI; se envía solo si ya existía en el servicio.
        imageUrl: data.imageUrl || undefined,
      },
      {
        onSuccess: () => setLocation(`/service/${id}`),
      }
    );
  };

  if (serviceLoading || !service) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container max-w-md py-20 text-center">
        <p className="text-muted-foreground mb-4">Inicia sesión para editar servicios.</p>
        <Button asChild>
          <Link href="/login">Iniciar sesión</Link>
        </Button>
      </div>
    );
  }

  if (!isOwner && user?.role !== "admin") {
    return (
      <div className="container max-w-md py-20 text-center">
        <p className="text-muted-foreground mb-4">Solo el dueño del servicio o un administrador puede editarlo.</p>
        <Button asChild variant="outline">
          <Link href={`/service/${id}`}>Volver al servicio</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="container max-w-2xl py-12 px-4">
      <Button variant="ghost" className="mb-6 gap-2" asChild>
        <Link href={`/service/${id}`}>
          <ArrowLeft className="h-4 w-4" />
          Volver al servicio
        </Link>
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>Editar servicio</CardTitle>
          <p className="text-sm text-muted-foreground">
            Modifica el nombre, la descripción o el precio de tu publicación.
          </p>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre del servicio</FormLabel>
                    <FormControl>
                      <Input placeholder="Ej: Limpieza completa de hogar" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Precio ($)</FormLabel>
                    <FormControl>
                      <Input type="text" inputMode="decimal" placeholder="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descripción</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Qué incluye este servicio..." className="min-h-[120px]" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/*
                Deshabilitado: no se configura foto del servicio.
                La foto que se muestra en el detalle es únicamente la del profesional.
              */}

              <Button type="submit" className="w-full" disabled={updateService.isPending}>
                {updateService.isPending ? (
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
