import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import {
  Camera,
  Eye,
  EyeOff,
  Loader2,
  Upload,
  UserPlus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PhotoCapture } from "@/components/PhotoCapture";
import { useToast } from "@/hooks/use-toast";
import { uploadProfileImage } from "@/lib/firebase-client";
import { hasFullAdminRole } from "@/lib/auth-utils";
import { useAuth } from "@/hooks/use-auth";
import { FULL_ADMIN_ONLY_ASSIGN_ROLES } from "@shared/admin-user-registration";
import { filterVisibleCatalogRoles, normalizeCatalogRole } from "@/lib/role-catalog-utils";

const adminRegisterSchema = z
  .object({
    name: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
    lastName: z.string().min(2, "El apellido debe tener al menos 2 caracteres"),
    email: z
      .string()
      .min(1, "El correo es obligatorio")
      .email("Email inválido")
      .transform((s) => s.trim().toLowerCase()),
    phone: z.string().min(1, "El teléfono es obligatorio").transform((s) => s.trim()),
    password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
    confirmPassword: z.string(),
    role: z.string().min(1, "Selecciona un rol"),
    companyName: z.string().trim().max(120).optional(),
    avatar: z.string().url("La URL de la imagen debe ser válida").optional().or(z.literal("")),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  })
  .refine((data) => data.role !== "central" || (data.companyName?.trim().length ?? 0) >= 2, {
    message: "El nombre de empresa es obligatorio",
    path: ["companyName"],
  });

type AdminRegisterForm = z.infer<typeof adminRegisterSchema>;

type RoleOption = { code: string; name: string; isSystem?: boolean; sortOrder?: number };

function sortRoleOptions(a: RoleOption, b: RoleOption): number {
  const order = (a.sortOrder ?? 99) - (b.sortOrder ?? 99);
  if (order !== 0) return order;
  return a.name.localeCompare(b.name, "es");
}

async function fetchRolesCatalog(): Promise<RoleOption[]> {
  const token = localStorage.getItem("token");
  const res = await fetch("/api/roles", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("No se pudieron cargar los roles");
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return filterVisibleCatalogRoles(data)
    .map((r) => normalizeCatalogRole(r))
    .filter((r): r is RoleOption => r != null)
    .map((r) => ({
      code: r.code,
      name: r.name,
      isSystem: r.isSystem,
      sortOrder: r.sortOrder,
    }));
}

type AdminRegisterUserFormProps = {
  onSuccess?: () => void;
  onCancel?: () => void;
  showCard?: boolean;
  title?: string;
  description?: string;
};

export function AdminRegisterUserForm({
  onSuccess,
  onCancel,
  showCard = true,
  title = "Registrar usuario",
  description = "Mismo flujo que el registro público, con asignación de rol desde el catálogo.",
}: AdminRegisterUserFormProps) {
  const { user: currentUser } = useAuth();
  const fullAdmin = hasFullAdminRole(currentUser);
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [profileImage, setProfileImage] = useState<File | null>(null);
  const [profileImagePreview, setProfileImagePreview] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: rolesCatalog = [], isLoading: rolesLoading } = useQuery({
    queryKey: ["roles"],
    queryFn: fetchRolesCatalog,
  });

  const roleOptions = rolesCatalog
    .filter((r) => {
      if (fullAdmin) return true;
      return !(FULL_ADMIN_ONLY_ASSIGN_ROLES as readonly string[]).includes(r.code);
    })
    .sort(sortRoleOptions);

  const form = useForm<AdminRegisterForm>({
    resolver: zodResolver(adminRegisterSchema),
    defaultValues: {
      name: "",
      lastName: "",
      email: "",
      phone: "",
      password: "",
      confirmPassword: "",
      role: "client",
      companyName: "",
      avatar: "",
    },
  });

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({
        variant: "destructive",
        title: "Formato inválido",
        description: "Solo se permiten imágenes (JPG, PNG, WebP, GIF).",
      });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({
        variant: "destructive",
        title: "Archivo muy grande",
        description: "La imagen no debe superar 5 MB.",
      });
      return;
    }
    setProfileImage(file);
    const reader = new FileReader();
    reader.onload = () => setProfileImagePreview(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleCameraCapture = (file: File) => {
    setProfileImage(file);
    const reader = new FileReader();
    reader.onload = () => setProfileImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setProfileImage(null);
    setProfileImagePreview(null);
  };

  async function onSubmit(data: AdminRegisterForm) {
    setIsLoading(true);
    try {
      let avatarUrl = (data.avatar || "").trim();
      if (profileImage) {
        avatarUrl = await uploadProfileImage(profileImage);
      }

      const token = localStorage.getItem("token");
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: data.name,
          lastName: data.lastName,
          email: data.email,
          phone: data.phone,
          password: data.password,
          role: data.role,
          companyName: data.role === "central" ? data.companyName?.trim() : undefined,
          avatar: avatarUrl || undefined,
        }),
      });

      const text = await res.text();
      let body: { message?: string; field?: string };
      try {
        body = JSON.parse(text);
      } catch {
        throw new Error(text || "Error del servidor");
      }

      if (!res.ok) {
        const field = body.field;
        if (field === "email") {
          form.setError("email", { type: "manual", message: body.message });
        } else if (field === "phone") {
          form.setError("phone", { type: "manual", message: body.message });
        } else if (field === "role") {
          form.setError("role", { type: "manual", message: body.message });
        }
        throw new Error(body.message || "No se pudo crear el usuario");
      }

      toast({
        title: "Usuario creado",
        description: `Cuenta registrada como ${roleOptions.find((r) => r.code === data.role)?.name ?? data.role}.`,
      });
      form.reset();
      removeImage();
      onSuccess?.();
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Error al crear la cuenta",
      });
    } finally {
      setIsLoading(false);
    }
  }

  const formBody = (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <div className="space-y-4">
          <div className="space-y-2">
            <FormLabel className="text-base">Foto de perfil (opcional)</FormLabel>
            <p className="text-sm text-muted-foreground">
              Puedes subir una foto, tomarla con la cámara o pegar una URL.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              capture="user"
              className="hidden"
              onChange={handleImageChange}
            />
            {profileImagePreview ? (
              <div className="flex items-center gap-4 p-3 rounded-lg border bg-muted/30">
                <Avatar className="h-16 w-16 ring-2 ring-primary/30">
                  <AvatarImage src={profileImagePreview} alt="Vista previa" />
                  <AvatarFallback>Foto</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{profileImage?.name || "Captura"}</p>
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={removeImage} aria-label="Quitar foto">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    fileInputRef.current?.removeAttribute("capture");
                    fileInputRef.current?.click();
                  }}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Subir imagen
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setIsCameraOpen(true)}
                >
                  <Camera className="h-4 w-4 mr-2" />
                  Tomar foto
                </Button>
              </div>
            )}
          </div>
          <FormField
            control={form.control}
            name="avatar"
            render={({ field }) => (
              <FormItem>
                <FormLabel>URL de imagen de perfil (opcional)</FormLabel>
                <FormControl>
                  <Input placeholder="https://ejemplo.com/imagen.jpg" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            name="role"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Rol en la plataforma</FormLabel>
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={rolesLoading || roleOptions.length === 0}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={rolesLoading ? "Cargando roles…" : "Seleccionar rol"} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {roleOptions.map((r) => (
                      <SelectItem key={r.code} value={r.code}>
                        {r.name}
                        {r.code !== r.name ? ` (${r.code})` : ""}
                        {!r.isSystem ? " · personalizado" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
                <p className="text-xs text-muted-foreground">
                  Incluye roles del sistema y personalizados del catálogo.
                  {" "}Si eliges Central, debes indicar el nombre de empresa.
                </p>
              </FormItem>
            )}
          />
          {form.watch("role") === "central" && (
            <FormField
              control={form.control}
              name="companyName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre de empresa</FormLabel>
                  <FormControl>
                    <Input placeholder="Mi empresa de taxi" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
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
                <FormLabel>Confirmar contraseña</FormLabel>
                <FormControl>
                  <Input type="password" placeholder="••••••••" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="flex flex-col gap-3 mt-6 sm:flex-row sm:justify-end">
          {onCancel ? (
            <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
              Cancelar
            </Button>
          ) : null}
          <Button type="submit" className="w-full sm:w-auto" disabled={isLoading || rolesLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creando cuenta...
              </>
            ) : (
              <>
                <UserPlus className="mr-2 h-4 w-4" />
                Crear usuario
              </>
            )}
          </Button>
        </div>
      </form>
    </Form>
  );

  const content = showCard ? (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{formBody}</CardContent>
    </Card>
  ) : (
    formBody
  );

  return (
    <>
      {content}
      <PhotoCapture isOpen={isCameraOpen} onOpenChange={setIsCameraOpen} onCapture={handleCameraCapture} />
    </>
  );
}
