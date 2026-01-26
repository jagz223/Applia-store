import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertServiceSchema } from "@shared/schema";
import { type InsertService } from "@shared/schema";
import { useCreateService, useCurrentProvider, useCategories } from "@/hooks/use-mango-data";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";

export default function CreateService() {
  const { data: provider, isLoading: providerLoading } = useCurrentProvider();
  const { data: categories } = useCategories();
  const createService = useCreateService();
  const [, setLocation] = useLocation();

  const form = useForm<InsertService>({
    resolver: zodResolver(insertServiceSchema),
    defaultValues: {
      providerId: 0,
      categoryId: 0,
      title: "",
      description: "",
      price: "0",
      imageUrl: "",
      isActive: true
    },
  });

  useEffect(() => {
    if (provider) {
      form.setValue("providerId", provider.id);
    }
  }, [provider, form]);

  if (providerLoading) {
    return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin" /></div>;
  }

  if (!provider) {
    return <div className="text-center py-20">You must be a provider to create services.</div>;
  }

  function onSubmit(data: InsertService) {
    // If user leaves image blank, we can use a placeholder in frontend display, 
    // but schema requires string.
    if (!data.imageUrl) {
        data.imageUrl = "https://images.unsplash.com/photo-1581092921461-eab62e97a783?w=500&h=300&fit=crop";
    }
    
    createService.mutate(data, {
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

              <div className="grid grid-cols-2 gap-4">
                 <FormField
                  control={form.control}
                  name="categoryId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <Select 
                        onValueChange={(val) => field.onChange(parseInt(val))}
                        defaultValue={field.value?.toString()}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select Category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {categories?.map((cat) => (
                            <SelectItem key={cat.id} value={cat.id.toString()}>
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
