import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertServiceSchema } from "@shared/schema";
import { type InsertService } from "@shared/schema";
import { useCreateService, useCurrentProvider, useCategories, useSubcategories } from "@/hooks/use-mango-data";
import { useAuth } from "@/hooks/use-auth";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Tag } from "lucide-react";
import { useEffect, useMemo } from "react";
import { getCategoryDisplayName } from "@shared/default-categories";

export default function CreateService() {
  const { user, isLoading: authLoading } = useAuth();
  const { data: providerFromApi, isLoading: providerApiLoading } = useCurrentProvider();
  /** Proveedor: primero del usuario (auth/me); si no, de la API dedicada (por si auth/me no trajo provider en caché). */
  const provider = user?.provider ?? providerFromApi ?? null;
  const { data: categories } = useCategories();
  const createService = useCreateService();
  const [, setLocation] = useLocation();

  const form = useForm<InsertService & { subcategoryId?: number | null }>({
    resolver: zodResolver(insertServiceSchema),
    defaultValues: {
      providerId: 0,
      categoryId: 0,
      subcategoryId: undefined,
      title: "",
      description: "",
      price: "0",
      imageUrl: "",
      isActive: true
    },
  });

  const providerCategoryId = (provider as { categoryId?: number })?.categoryId ?? null;
  const providerCategorySlug = (provider as { category?: string })?.category ?? null;
  const providerCategory = useMemo(() => {
    if (providerCategoryId != null && !Number.isNaN(providerCategoryId)) {
      return categories?.find((c) => c.id === providerCategoryId) ?? null;
    }
    if (providerCategorySlug && categories?.length) {
      return categories.find((c) => (c as { slug?: string }).slug === providerCategorySlug) ?? null;
    }
    return null;
  }, [categories, providerCategoryId, providerCategorySlug]);

  const resolvedCategoryId = providerCategory?.id ?? providerCategoryId;
  const { data: subcategories = [] } = useSubcategories(resolvedCategoryId ?? undefined);

  useEffect(() => {
    if (provider) {
      form.setValue("providerId", provider.id);
      if (resolvedCategoryId != null && !Number.isNaN(Number(resolvedCategoryId))) {
        form.setValue("categoryId", Number(resolvedCategoryId));
      }
    }
  }, [provider, resolvedCategoryId, form]);

  if (authLoading || (user?.role === "professional" && !user?.provider && providerApiLoading)) {
    return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin" /></div>;
  }

  if (!user) {
    return (
      <div className="container max-w-md py-20 text-center">
        <p className="text-muted-foreground mb-4">Inicia sesión para crear servicios.</p>
        <Button asChild>
          <Link href="/login">Iniciar sesión</Link>
        </Button>
      </div>
    );
  }

  if (!provider) {
    const isProfessional = user.role === "professional";
    return (
      <div className="container max-w-md py-20 text-center">
        <p className="text-muted-foreground mb-4">
          {isProfessional
            ? "Completa tu perfil de proveedor para poder crear servicios."
            : "Debes ser proveedor para crear servicios."}
        </p>
        <Button asChild>
          <Link href="/become-pro">Convertirse en profesional</Link>
        </Button>
      </div>
    );
  }

  function onSubmit(data: InsertService & { subcategoryId?: number | null }) {
    // If user leaves image blank, we can use a placeholder in frontend display, 
    // but schema requires string.
    if (!data.imageUrl) {
        data.imageUrl = "https://images.unsplash.com/photo-1581092921461-eab62e97a783?w=500&h=300&fit=crop";
    }
    const payload = { ...data, subcategoryId: data.subcategoryId ?? undefined };
    createService.mutate(payload, {
      onSuccess: () => setLocation("/dashboard"),
    });
  }

  return (
    <div className="container max-w-2xl py-12 px-4">
      <Card>
        <CardHeader>
          <CardTitle>Add New Service</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Service Title</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Full House Cleaning" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="categoryId"
                render={() => (
                  <FormItem>
                    <FormLabel>Categoría</FormLabel>
                    <FormControl>
                      <div className="flex h-10 w-full items-center gap-2 rounded-md border border-input bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                        <Tag className="h-4 w-4 shrink-0" />
                        <span>
                          {providerCategory ? getCategoryDisplayName(providerCategory) : "Categoría de tu perfil de proveedor"}
                        </span>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {subcategories.length > 0 && (
                <FormField
                  control={form.control}
                  name="subcategoryId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Subcategoría (opcional)</FormLabel>
                      <Select
                        onValueChange={(v) => field.onChange(v === "none" || !v ? undefined : Number(v))}
                        value={field.value != null ? String(field.value) : "none"}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona una subcategoría" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">Ninguna</SelectItem>
                          {subcategories.map((sub) => (
                            <SelectItem key={String(sub.id)} value={String(sub.id)}>
                              {sub.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Price ($)</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea placeholder="What's included in this service?" className="h-32" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="imageUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Image URL (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="https://..." {...field} value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full" disabled={createService.isPending}>
                {createService.isPending ? "Creating..." : "Create Service"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
