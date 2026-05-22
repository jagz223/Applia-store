import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { useToast } from "@/hooks/use-toast";
import {
  createRoleCatalogSchema,
  roleCatalogFieldsSchema,
  isImmutableRoleCode,
} from "@shared/role-definition";
import { emptyPermissionsMap } from "@shared/role-permissions";
import {
  RolePermissionsEditor,
} from "@/components/admin/RolePermissionsEditor";
import { permissionsForRoleForm } from "@/lib/role-form-permissions";
import type { RoleDefinitionRow } from "./AdminRolesPanel";

const createFormSchema = createRoleCatalogSchema;
type CreateFormValues = z.infer<typeof createFormSchema>;
type EditFormValues = z.infer<typeof roleCatalogFieldsSchema>;

const DEFAULT_CREATE_SORT_ORDER = 99;

function codeFromName(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "") || "rol"
  );
}

type AdminRoleFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit" | "view";
  role?: RoleDefinitionRow | null;
  onSuccess: () => void;
};

export function AdminRoleFormDialog({
  open,
  onOpenChange,
  mode,
  role,
  onSuccess,
}: AdminRoleFormDialogProps) {
  const { toast } = useToast();
  const readOnly = mode === "view" || (role != null && isImmutableRoleCode(role.code));
  const isCreate = mode === "create";

  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [pendingCreate, setPendingCreate] = useState<CreateFormValues | null>(null);
  const [pendingEdit, setPendingEdit] = useState<EditFormValues | null>(null);

  const createForm = useForm<CreateFormValues>({
    resolver: zodResolver(createFormSchema),
    defaultValues: {
      code: "",
      name: "",
      description: "",
      responsibilities: "",
      permissions: emptyPermissionsMap(),
    },
  });

  const editForm = useForm<EditFormValues>({
    resolver: zodResolver(roleCatalogFieldsSchema),
    defaultValues: {
      name: "",
      description: "",
      responsibilities: "",
      permissions: emptyPermissionsMap(),
    },
  });

  const activeForm = isCreate ? createForm : editForm;
  const hasUnsavedChanges = activeForm.formState.isDirty && !readOnly;

  useEffect(() => {
    if (!open) return;
    setSaveConfirmOpen(false);
    setDiscardConfirmOpen(false);
    setPendingCreate(null);
    setPendingEdit(null);

    if (isCreate) {
      createForm.reset({
        code: "",
        name: "",
        description: "",
        responsibilities: "",
        permissions: emptyPermissionsMap(),
      });
      return;
    }
    if (role) {
      editForm.reset({
        name: role.name ?? "",
        description: role.description ?? "",
        responsibilities: role.responsibilities ?? "",
        permissions: permissionsForRoleForm(role.code, role.permissions),
      });
    }
  }, [open, isCreate, role, createForm, editForm]);

  const watchedName = createForm.watch("name");
  useEffect(() => {
    if (!isCreate || !open) return;
    const current = createForm.getValues("code");
    const suggested = codeFromName(watchedName || "");
    if (!current || current === suggested) {
      createForm.setValue("code", suggested, { shouldDirty: true });
    }
  }, [watchedName, isCreate, open, createForm]);

  function requestClose() {
    if (readOnly) {
      onOpenChange(false);
      return;
    }
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

  async function submitCreate(data: CreateFormValues) {
    const token = localStorage.getItem("token");
    const res = await fetch("/api/roles", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        code: data.code.trim().toLowerCase(),
        name: data.name.trim(),
        description: data.description.trim(),
        responsibilities: data.responsibilities?.trim() || undefined,
        permissions: data.permissions,
        sortOrder: DEFAULT_CREATE_SORT_ORDER,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.message || "Error al crear el rol");
    toast({ title: "Rol creado", description: `Se registró el rol "${data.name}".` });
    onSuccess();
    onOpenChange(false);
  }

  async function submitEdit(data: EditFormValues) {
    if (!role) return;
    const token = localStorage.getItem("token");
    const res = await fetch(`/api/roles/${encodeURIComponent(role.code)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        name: data.name.trim(),
        description: data.description.trim(),
        responsibilities: data.responsibilities?.trim() || undefined,
        permissions: data.permissions,
        sortOrder: role.sortOrder ?? 0,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.message || "Error al actualizar el rol");
    toast({ title: "Rol actualizado", description: `Se guardaron los cambios de "${data.name}".` });
    onSuccess();
    onOpenChange(false);
  }

  async function confirmSave() {
    setSaveConfirmOpen(false);
    try {
      if (pendingCreate) {
        await submitCreate(pendingCreate);
        setPendingCreate(null);
      } else if (pendingEdit) {
        await submitEdit(pendingEdit);
        setPendingEdit(null);
      }
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Error",
        description: e instanceof Error ? e.message : "No se pudo guardar",
      });
    }
  }

  const title =
    mode === "create"
      ? "Crear nuevo rol"
      : readOnly
        ? `Rol: ${role?.name ?? role?.code}`
        : `Editar rol: ${role?.name ?? ""}`;

  const description =
    mode === "create"
      ? "Define el nombre y marca permisos por bloque: administrativas, asociado/central o cliente."
      : readOnly
        ? "Rol inmutable: solo consulta."
        : "Actualiza nombre, descripción y permisos activos.";

  const permissionBlock = (
    form: {
      setValue: (n: "permissions", v: Record<string, boolean>, o?: object) => void;
      watch: (n: "permissions") => Record<string, boolean>;
    }
  ) => (
    <FormItem>
      <RolePermissionsEditor
        value={form.watch("permissions")}
        readOnly={readOnly}
        onChange={(next) =>
          form.setValue("permissions", next, { shouldValidate: true, shouldDirty: true })
        }
      />
    </FormItem>
  );

  const editFieldsBody = (form: typeof editForm) => (
    <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
      {role && (
        <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm font-mono">{role.code}</div>
      )}
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Nombre para mostrar</FormLabel>
            <FormControl>
              <Input readOnly={readOnly} {...field} />
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
            <FormLabel>Resumen breve</FormLabel>
            <FormControl>
              <Textarea readOnly={readOnly} className="min-h-[60px]" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="responsibilities"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Función principal (opcional)</FormLabel>
            <FormControl>
              <Textarea readOnly={readOnly} className="min-h-[70px]" {...field} value={field.value ?? ""} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      {permissionBlock(form)}
    </div>
  );

  const createFieldsBody = (
    <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
      <FormField
        control={createForm.control}
        name="code"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Código interno</FormLabel>
            <FormControl>
              <Input placeholder="ej. moderador" {...field} className="font-mono" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      {editFieldsBody(createForm as unknown as typeof editForm)}
    </div>
  );

  const roleNameForConfirm = isCreate
    ? pendingCreate?.name?.trim() || createForm.getValues("name")?.trim()
    : pendingEdit?.name?.trim() || editForm.getValues("name")?.trim() || role?.name;

  return (
    <>
      <Dialog open={open} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="max-w-2xl sm:max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {readOnly && <Lock className="h-4 w-4 text-muted-foreground" />}
              {title}
            </DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          {isCreate ? (
            <Form {...createForm}>
              <form
                onSubmit={createForm.handleSubmit((data) => {
                  setPendingCreate(data);
                  setSaveConfirmOpen(true);
                })}
              >
                {createFieldsBody}
                <DialogFooter className="mt-4 gap-2">
                  <Button type="button" variant="outline" onClick={requestClose}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={createForm.formState.isSubmitting}>
                    {createForm.formState.isSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Guardar"
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          ) : (
            <Form {...editForm}>
              <form
                onSubmit={editForm.handleSubmit((data) => {
                  if (readOnly) {
                    onOpenChange(false);
                    return;
                  }
                  setPendingEdit(data);
                  setSaveConfirmOpen(true);
                })}
              >
                {editFieldsBody(editForm)}
                <DialogFooter className="mt-4 gap-2">
                  <Button type="button" variant="outline" onClick={requestClose}>
                    {readOnly ? "Cerrar" : "Cancelar"}
                  </Button>
                  {!readOnly && (
                    <Button type="submit" disabled={editForm.formState.isSubmitting}>
                      {editForm.formState.isSubmitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Guardar"
                      )}
                    </Button>
                  )}
                </DialogFooter>
              </form>
            </Form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={saveConfirmOpen} onOpenChange={setSaveConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Guardar los cambios del rol?</AlertDialogTitle>
            <AlertDialogDescription>
              {roleNameForConfirm ? (
                <>
                  Vas a aplicar la configuración de permisos y datos de{" "}
                  <strong>{roleNameForConfirm}</strong>. Los usuarios con este rol heredarán estos
                  accesos en la plataforma.
                </>
              ) : (
                "Vas a aplicar la configuración de permisos y datos de este rol. Los usuarios asignados heredarán estos accesos."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSaveConfirmOpen(false)}>
              Revisar de nuevo
            </AlertDialogCancel>
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
              Tienes cambios sin guardar en este rol. Si sales ahora, se perderán y no se aplicarán
              en el catálogo.
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
