import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertProviderSchema } from "@shared/schema";
import { type InsertProvider } from "@shared/schema";
import { useCreateProvider, useCurrentProvider } from "@/hooks/use-mango-data";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";

export default function BecomePro() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { data: existingProfile, isLoading: profileLoading } = useCurrentProvider();
  const createProvider = useCreateProvider();
  const [, setLocation] = useLocation();

  const form = useForm<InsertProvider>({
    resolver: zodResolver(insertProviderSchema),
    defaultValues: {
      userId: "", // Will be set in useEffect
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
      setLocation("/dashboard");
    }
  }, [existingProfile, setLocation]);

  if (authLoading || profileLoading) {
    return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin" /></div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="container max-w-md py-20 text-center">
        <h1 className="text-2xl font-bold mb-4">Sign in required</h1>
        <p className="mb-6 text-muted-foreground">You need an account to become a provider.</p>
        <a href="/api/login">
          <Button className="w-full">Sign In / Sign Up</Button>
        </a>
      </div>
    );
  }

  function onSubmit(data: InsertProvider) {
    createProvider.mutate(data, {
      onSuccess: () => setLocation("/dashboard"),
    });
  }

  return (
    <div className="container max-w-2xl py-12 px-4">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-display font-bold text-primary mb-2">Join as a Pro</h1>
        <p className="text-muted-foreground">Start earning by offering your services on Mango.</p>
      </div>

      <Card className="border-border/50 shadow-xl">
        <CardHeader>
          <CardTitle>Professional Profile</CardTitle>
          <CardDescription>Tell us about your skills and experience.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              
              <FormField
                control={form.control}
                name="profession"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Profession / Title</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Master Plumber, Graphic Designer" {...field} />
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
                      <FormLabel>Years Experience</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          {...field} 
                          onChange={e => field.onChange(parseInt(e.target.value))} 
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
                      <FormLabel>Hourly Rate ($)</FormLabel>
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
                    <FormLabel>Bio & Skills</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Describe your expertise, certifications, and what you offer..." 
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
                {createProvider.isPending ? "Creating Profile..." : "Create Profile"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
