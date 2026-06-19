import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { useToast } from "@/hooks/use-toast";
import { fetchAdminJson } from "@/lib/admin-api";
import { filterVisibleCatalogRoles } from "@/lib/role-catalog-utils";
import type { AdminUserDetail } from "@/lib/admin-user-edit";

const editUserSchema = z
  .object({
    name: z.string().min(1, "El nombre es requerido").max(100),
    lastName: z.string().min(1, "El apellido es requerido").max(100),
    email: z.string().email("Correo inválido"),
    phone: z.string().max(50).optional(),
    role: z.string().min(1, "El rol es requerido"),
    newPassword: z
      .string()
      .max(100)
      .optional()
      .refine((v) => !v || v.length >= 6, "Mínimo 6 caracteres"),
    confirmNewPassword: z.string().max(100).optional(),
  })
  .refine((data) => !data.newPassword?.trim() || data.newPassword === data.confirmNewPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmNewPassword"],
  });

type EditUserFormValues = z.infer<typeof editUserSchema>;

type AdminEditUserDialogProps = {
  open: boolean;
  userId: string | null;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

async function fetchRolesCatalog() {
  const data = await fetchAdminJson<{ code: string; name: string }[]>("/api/roles");
  return filterVisibleCatalogRoles(Array.isArray(data) ? data : []);
}

export function AdminEditUserDialog({
  open,
  userId,
  onOpenChange,
  onSuccess,
}: AdminEditUserDialogProps) {
  const { toast } = useToast();
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [pendingValues, setPendingValues] = useState<EditUserFormValues | null>(null);

  const form = useForm<EditUserFormValues>({
    resolver: zodResolver(editUserSchema),
    defaultValues: {
      name: "",
      lastName: "",
      email: "",
      phone: "",
      role: "client",
      newPassword: "",
      confirmNewPassword: "",
    },
  });

  const { data: roles = [] } = useQuery({
    queryKey: ["roles"],
    queryFn: fetchRolesCatalog,
    enabled: open,
  });

  const {
    data: userDetail,
    isLoading: userLoading,
    isError: userError,
  } = useQuery({
    queryKey: ["admin-user-detail", userId],
    queryFn: () => fetchAdminJson<AdminUserDetail>(`/api/admin/users/${userId}`),
    enabled: open && !!userId,
  });

  useEffect(() => {
    if (!open || !userId) return;
    setSaveConfirmOpen(false);
    setDiscardConfirmOpen(false);
    setPendingValues(null);
  }, [open, userId]);

  useEffect(() => {
    if (!userDetail || !open) return;
    form.reset({
      name: userDetail.name ?? "",
      lastName: userDetail.lastName ?? "",
      email: userDetail.email ?? "",
      phone: userDetail.phone ?? "",
      role: userDetail.role ?? "client",
      newPassword: "",
      confirmNewPassword: "",
    });
  }, [userDetail, open, form]);

  const hasUnsavedChanges = form.formState.isDirty;

  function requestClose() {
    if (hasUnsavedChanges) {
      setDiscardConfirmOpen(true);
      return;
    }
    onOpenChange(false);
  }

  function handleDialogOpenChange(next: boolean) {
    if (next) {
      onOpenChange(true);
      return;
    }
    requestClose();
  }

  function confirmDiscard() {
    setDiscardConfirmOpen(false);
    onOpenChange(false);
  }

  async function applySave(data: EditUserFormValues) {
    if (!userId) return;
    const body: Record<string, string> = {
      name: data.name.trim(),
      lastName: data.lastName.trim(),
      email: data.email.trim(),
      role: data.role,
    };
    if (data.phone !== undefined) body.phone = data.phone.trim();
    if (data.newPassword?.trim()) body.newPassword = data.newPassword.trim();

    await fetchAdminJson(`/api/admin/users/${userId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    toast({
      title: "Usuario actualizado",
      description: "Los datos de la cuenta se guardaron correctamente.",
    });
    onSuccess?.();
    onOpenChange(false);
  }

  async function confirmSave() {
    setSaveConfirmOpen(false);
    if (!pendingValues) return;
    try {
      await applySave(pendingValues);
      setPendingValues(null);
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Error",
        description: e instanceof Error ? e.message : "No se pudo actualizar el usuario.",
      });
    }
  }

  const displayName =
    [form.watch("name"), form.watch("lastName")].filter(Boolean).join(" ").trim() ||
    userDetail?.email ||
    "Usuario";

  return (
    <>
      <Dialog open={open} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col gap-0 p-0">
          <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
            <DialogTitle>Editar usuario</DialogTitle>
            <DialogDescription>
              Datos de cuenta: nombre, correo, rol y contraseña. Los asociados con ficha de proveedor se
              editan en la pantalla completa de asociados.
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-y-auto flex-1 min-h-0 px-6 pb-2">
            {userLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : userError ? (
              <p className="text-sm text-destructive py-8 text-center">
                No se pudo cargar el usuario.
              </p>
            ) : (
              <Form {...form}>
                <form
                  id="admin-edit-user-form"
                  className="space-y-4"
                  onSubmit={form.handleSubmit((data) => {
                    setPendingValues(data);
                    setSaveConfirmOpen(true);
                  })}
                >
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
                          <Input
                            placeholder="+58 414 1234567"
                            {...field}
                            value={field.value ?? ""}
                          />
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
                              <SelectItem key={r.code} value={r.code}>
                                {r.name}
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
                    name="newPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nueva contraseña (opcional)</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            autoComplete="new-password"
                            placeholder="Dejar en blanco para no cambiar"
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="confirmNewPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirmar nueva contraseña</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            autoComplete="new-password"
                            placeholder="Repite la nueva contraseña"
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </form>
              </Form>
            )}
          </div>

          <DialogFooter className="px-6 py-4 border-t shrink-0 gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={requestClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              form="admin-edit-user-form"
              disabled={userLoading || userError || form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Guardar cambios"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={saveConfirmOpen} onOpenChange={setSaveConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Guardar los cambios de la cuenta?</AlertDialogTitle>
            <AlertDialogDescription>
              Vas a actualizar los datos de <strong>{displayName}</strong>.
              {pendingValues?.newPassword?.trim() ? (
                <>
                  {" "}
                  También cambiarás su contraseña: el usuario deberá usar la nueva clave para iniciar sesión.
                </>
              ) : (
                <> El rol se aplicará de inmediato en la plataforma.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Revisar de nuevo</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void confirmSave()}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Sí, guardar cambios
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={discardConfirmOpen} onOpenChange={setDiscardConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Salir sin guardar?</AlertDialogTitle>
            <AlertDialogDescription>
              Tienes cambios sin guardar en este usuario. Si cierras ahora, no se aplicarán.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Seguir editando</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDiscard}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Sí, salir sin guardar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
