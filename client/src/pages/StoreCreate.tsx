import { useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Loader2, Store } from "lucide-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { storeNameSchema } from "@shared/store-schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { MY_STORE_QUERY_KEY, useMyStore, useStoreSubscriptionQuote } from "@/hooks/use-my-store";

const createStoreFormSchema = z.object({
  name: storeNameSchema,
});

type CreateStoreForm = z.infer<typeof createStoreFormSchema>;

export default function StoreCreate() {
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: myStore, isLoading: mineLoading } = useMyStore(isAuthenticated);
  const { data: quote, isLoading: quoteLoading } = useStoreSubscriptionQuote();

  const form = useForm<CreateStoreForm>({
    resolver: zodResolver(createStoreFormSchema),
    defaultValues: { name: "" },
  });

  useEffect(() => {
    if (myStore?.slug) {
      setLocation(`/tienda/${encodeURIComponent(myStore.slug)}`);
    }
  }, [myStore?.slug, setLocation]);

  const createMutation = useMutation({
    mutationFn: async (values: CreateStoreForm) => {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/stores", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ name: values.name.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudo crear la tienda");
      }
      return res.json() as Promise<{ store: { slug: string; name: string } }>;
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: MY_STORE_QUERY_KEY });
      toast({
        title: "Tienda creada",
        description: `«${data.store.name}» está lista. Puedes activarla cuando quieras con la mensualidad.`,
      });
      setLocation(`/tienda/${encodeURIComponent(data.store.slug)}`);
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  if (!isAuthenticated) {
    return (
      <div className="container max-w-lg py-12 px-4">
        <Card>
          <CardHeader>
            <CardTitle>Crear tienda</CardTitle>
            <CardDescription>Inicia sesión para abrir tu tienda en GenFeb.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href="/login?next=/tienda/crear">Iniciar sesión</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (mineLoading || myStore) {
    return (
      <div className="container py-16 flex justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const monthlyUsd = quote?.monthlyUsd ?? 15;
  const monthlyLabel = quote?.label ?? `USD ${monthlyUsd}`;

  return (
    <div className="container max-w-lg py-8 sm:py-12 px-4">
      <Button variant="ghost" size="sm" className="mb-6 gap-2" asChild>
        <Link href="/settings">
          <ArrowLeft className="h-4 w-4" /> Configuración
        </Link>
      </Button>

      <Card className="border-primary/20 shadow-lg overflow-hidden">
        <div className="h-1.5 bg-gradient-to-r from-primary via-violet-500 to-emerald-500" />
        <CardHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Store className="h-5 w-5" />
            </div>
            <CardTitle className="text-xl">Crear tu tienda</CardTitle>
          </div>
          <CardDescription>
            Tener una tienda con objetos publicados cuesta{" "}
            <strong className="text-foreground">{monthlyLabel}/mes</strong>
            {quoteLoading ? " (cargando tarifa…)" : ""}. Puedes crear la tienda ahora y pagar la mensualidad cuando
            quieras activar la visibilidad pública.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form
              className="space-y-4"
              onSubmit={form.handleSubmit((values) => createMutation.mutate(values))}
            >
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre de la tienda</FormLabel>
                    <FormControl>
                      <Input placeholder="Ej: Panadería La Esquina" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" size="lg" disabled={createMutation.isPending}>
                {createMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Continuar
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
