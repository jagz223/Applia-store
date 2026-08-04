import { useState } from "react";
import { useNoIndex } from "@/hooks/use-no-index";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, UserPlus, Loader2, Camera, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@shared/routes";
import { isGuest } from "@/lib/auth-utils";
import { AlreadyAuthenticatedView } from "@/components/AlreadyAuthenticatedView";
import { uploadProfileImage } from "@/lib/firebase-client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PhotoCapture } from "@/components/PhotoCapture";

const registerSchema = z.object({
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
  lastName: z.string().min(2, "El apellido debe tener al menos 2 caracteres"),
  email: z
    .string()
    .min(1, "El correo es obligatorio")
    .email("Email inválido")
    .transform((s) => s.trim().toLowerCase()),
  phone: z
    .string()
    .min(1, "El teléfono es obligatorio")
    .transform((s) => s.trim()),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
  confirmPassword: z.string(),
  role: z.literal("client"),
})
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

type RegisterForm = z.infer<typeof registerSchema>;

export default function Register() {
  useNoIndex();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [profileImage, setProfileImage] = useState<File | null>(null);
  const [profileImagePreview, setProfileImagePreview] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user, isLoading: authLoading, setUser } = useAuth();

  const form = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: "",
      lastName: "",
      email: "",
      phone: "",
      password: "",
      confirmPassword: "",
      role: "client",
    },
  });

  const onSubmit = async (data: RegisterForm) => {
    if (!profileImage) {
      setPhotoError("Debes tomar una foto de perfil.");
      toast({
        variant: "destructive",
        title: "Foto requerida",
        description: "Debes tomar una foto de perfil con la cámara para registrarte.",
      });
      return;
    }
    setPhotoError(null);
    setIsLoading(true);
    try {
      const avatarUrl = await uploadProfileImage(profileImage);

      const response = await fetch(api.auth.register.path, {
        method: api.auth.register.method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ...data, avatar: avatarUrl }),
      });

      const text = await response.text();

      let result;
      try {
        result = JSON.parse(text);
      } catch {
        throw new Error(`Error del servidor: ${text.substring(0, 100)}`);
      }

      if (!response.ok) {
        if (response.status === 409) {
          const msg = result.message || "Ya existe una cuenta con esos datos.";
          const field = (result as { field?: string }).field;
          if (field === "phone") {
            form.setError("phone", { type: "manual", message: msg });
          } else {
            form.setError("email", { type: "manual", message: msg });
          }
          toast({
            variant: "destructive",
            title: "No se pudo crear la cuenta",
            description: msg,
          });
          return;
        }
        throw new Error(result.message || "Error al registrar usuario");
      }

      localStorage.setItem("token", result.token);
      setUser(result.user);

      toast({
        title: "Cuenta creada",
        description: `Bienvenido ${result.user.name}, tu cuenta ha sido creada correctamente.`,
      });

      setLocation(`/account-recovery/setup?next=${encodeURIComponent("/")}`);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Error al crear la cuenta",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCameraCapture = (file: File) => {
    setProfileImage(file);
    setPhotoError(null);
    const reader = new FileReader();
    reader.onload = () => setProfileImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setProfileImage(null);
    setProfileImagePreview(null);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-mango-orange/20 via-background to-mango-green/20 p-4">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!isGuest(user)) {
    return <AlreadyAuthenticatedView />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-mango-orange/20 via-background to-mango-green/20 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold text-mango-orange">
            Crear Cuenta
          </CardTitle>
          <CardDescription>
            Regístrate en Applia para acceder a servicios
          </CardDescription>
        </CardHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <FormLabel className="text-base">
                  Foto de perfil <span className="text-destructive">*</span>
                </FormLabel>
                <p className="text-sm text-muted-foreground">
                  Toma una foto con la cámara de tu dispositivo.
                </p>
                {profileImagePreview ? (
                  <div className="flex items-center gap-4 p-3 rounded-lg border bg-muted/30">
                    <Avatar className="h-16 w-16 ring-2 ring-mango-orange/50">
                      <AvatarImage src={profileImagePreview} alt="Vista previa" />
                      <AvatarFallback>Foto</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{profileImage?.name || "Captura"}</p>
                      <p className="text-xs text-muted-foreground">
                        {profileImage ? (profileImage.size / 1024).toFixed(1) : "0"} KB
                      </p>
                    </div>
                    <Button type="button" variant="ghost" size="icon" onClick={removeImage} aria-label="Quitar foto">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => setIsCameraOpen(true)}
                  >
                    <Camera className="h-4 w-4 mr-2" />
                    Tomar foto
                  </Button>
                )}
                {!profileImagePreview && (
                  <p className="text-xs text-amber-600 dark:text-amber-500">
                    Usa la cámara de tu dispositivo para capturar la foto.
                  </p>
                )}
                {photoError && (
                  <p className="text-sm text-destructive">{photoError}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre</FormLabel>
                      <FormControl>
                        <Input placeholder="Juan" {...field} />
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
                        <Input placeholder="Pérez" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
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
                    <FormLabel>Teléfono</FormLabel>
                    <FormControl>
                      <Input type="tel" placeholder="+593 99 123 4567" {...field} />
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
                    <FormLabel>Contraseña</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type={showPassword ? "text" : "password"}
                          placeholder="••••••••"
                          {...field}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                          onClick={() => setShowPassword(!showPassword)}
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
              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirmar Contraseña</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="••••••••"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
            <CardFooter className="flex flex-col space-y-4">
              <Button type="submit" className="w-full" disabled={isLoading || !profileImage}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creando cuenta...
                  </>
                ) : (
                  <>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Crear Cuenta
                  </>
                )}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                ¿Ya tienes cuenta?{" "}
                <Link href="/login" className="text-mango-orange hover:underline font-medium">
                  Inicia sesión
                </Link>
              </p>
            </CardFooter>
          </form>
        </Form>
      </Card>
      
      <PhotoCapture 
        isOpen={isCameraOpen} 
        onOpenChange={setIsCameraOpen} 
        onCapture={handleCameraCapture} 
      />
    </div>
  );
}
