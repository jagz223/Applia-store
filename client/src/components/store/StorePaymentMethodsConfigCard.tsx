import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import {
  useCreateStorePaymentMethod,
  useDeleteStorePaymentMethod,
  useStorePaymentMethods,
  useUpdateStorePaymentMethod,
  type StorePaymentMethodSummary,
} from "@/hooks/use-store-payment-methods";
import { StoreCoverPhotoPicker } from "@/components/store/StoreCoverPhotoPicker";
import { uploadStorePaymentMethodImage } from "@/lib/firebase-client";
import { revokeBlobPreview } from "@/lib/store-image-draft";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { cn } from "@/lib/utils";

const NEW_TAB = "_new";

type PaymentMethodFormState = {
  name: string;
  accountNumber: string;
  imagePreviewUrl: string | null;
  pendingImageFile: File | null;
};

function emptyForm(): PaymentMethodFormState {
  return { name: "", accountNumber: "", imagePreviewUrl: null, pendingImageFile: null };
}

function formFromMethod(method: StorePaymentMethodSummary): PaymentMethodFormState {
  return {
    name: method.name,
    accountNumber: method.accountNumber,
    imagePreviewUrl: method.imageUrl,
    pendingImageFile: null,
  };
}

function PaymentMethodForm({
  storeId,
  methodId,
  initial,
  onSaved,
  onDeleted,
}: {
  storeId: number;
  methodId: number | null;
  initial: PaymentMethodFormState;
  onSaved: (method: StorePaymentMethodSummary) => void;
  onDeleted?: () => void;
}) {
  const { toast } = useToast();
  const isNew = methodId == null;

  const [form, setForm] = useState(initial);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const createMutation = useCreateStorePaymentMethod(storeId);
  const updateMutation = useUpdateStorePaymentMethod(storeId);
  const deleteMutation = useDeleteStorePaymentMethod(storeId);

  const saving = createMutation.isPending || updateMutation.isPending;
  const deleting = deleteMutation.isPending;

  useEffect(() => {
    setForm(initial);
  }, [initial, methodId]);

  function handleImageChange(url: string | null, file?: File | null) {
    setForm((prev) => ({
      ...prev,
      imagePreviewUrl: url,
      pendingImageFile: file ?? null,
    }));
  }

  async function resolveImageUrl(): Promise<string | null> {
    if (form.pendingImageFile) {
      return uploadStorePaymentMethodImage(storeId, form.pendingImageFile);
    }
    return form.imagePreviewUrl?.trim() || null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = form.name.trim();
    const trimmedAccount = form.accountNumber.trim();
    if (!trimmedName) {
      toast({ variant: "destructive", title: "Nombre obligatorio" });
      return;
    }
    if (!trimmedAccount) {
      toast({ variant: "destructive", title: "Número de cuenta obligatorio" });
      return;
    }

    try {
      const imageUrl = await resolveImageUrl();
      const payload = {
        name: trimmedName,
        accountNumber: trimmedAccount,
        imageUrl,
      };

      if (isNew) {
        const created = await createMutation.mutateAsync(payload);
        if (form.imagePreviewUrl?.startsWith("blob:")) revokeBlobPreview(form.imagePreviewUrl);
        toast({ title: "Método de pago creado" });
        onSaved(created);
      } else {
        const updated = await updateMutation.mutateAsync({ paymentMethodId: methodId, body: payload });
        if (form.imagePreviewUrl?.startsWith("blob:")) revokeBlobPreview(form.imagePreviewUrl);
        toast({ title: "Método de pago actualizado" });
        onSaved(updated);
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: isNew ? "No se pudo crear" : "No se pudo actualizar",
        description: err instanceof Error ? err.message : "Error desconocido",
      });
    }
  }

  async function confirmDelete() {
    if (methodId == null) return;
    try {
      await deleteMutation.mutateAsync(methodId);
      if (form.imagePreviewUrl?.startsWith("blob:")) revokeBlobPreview(form.imagePreviewUrl);
      toast({ title: "Método de pago eliminado" });
      setDeleteOpen(false);
      onDeleted?.();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "No se pudo eliminar",
        description: err instanceof Error ? err.message : "Error desconocido",
      });
    }
  }

  return (
    <>
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor={`pm-name-${methodId ?? "new"}`}>Banco o aplicación</Label>
          <Input
            id={`pm-name-${methodId ?? "new"}`}
            value={form.name}
            maxLength={120}
            disabled={saving || deleting}
            placeholder="Ej. Banco Pichincha, PayPal, Deuna"
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`pm-account-${methodId ?? "new"}`}>Número de cuenta</Label>
          <Input
            id={`pm-account-${methodId ?? "new"}`}
            value={form.accountNumber}
            maxLength={80}
            disabled={saving || deleting}
            placeholder="Cuenta, teléfono o alias de pago"
            onChange={(e) => setForm((prev) => ({ ...prev, accountNumber: e.target.value }))}
          />
        </div>

        <StoreCoverPhotoPicker
          label="Imagen (código QR u otro)"
          previewUrl={form.imagePreviewUrl}
          disabled={saving || deleting}
          onPreviewChange={handleImageChange}
        />

        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
          <Button type="submit" disabled={saving || deleting}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {isNew ? "Crear método" : "Guardar cambios"}
          </Button>
          {!isNew ? (
            <Button
              type="button"
              variant="outline"
              className="text-destructive hover:text-destructive"
              disabled={saving || deleting}
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Eliminar
            </Button>
          ) : null}
        </div>
      </form>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar método de pago?</AlertDialogTitle>
            <AlertDialogDescription>
              Este método dejará de estar disponible para tus clientes. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
            >
              {deleting ? "Eliminando…" : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function StorePaymentMethodsConfigCard({ storeId }: { storeId: number }) {
  const { data: methods = [], isLoading, error } = useStorePaymentMethods(storeId);
  const [activeTab, setActiveTab] = useState<string>(NEW_TAB);

  useEffect(() => {
    if (activeTab === NEW_TAB) return;
    const exists = methods.some((m) => String(m.id) === activeTab);
    if (!exists && methods.length > 0) {
      setActiveTab(String(methods[0].id));
    } else if (!exists && methods.length === 0) {
      setActiveTab(NEW_TAB);
    }
  }, [methods, activeTab]);

  function tabLabel(method: StorePaymentMethodSummary) {
    const label = method.name.trim() || `Método #${method.id}`;
    return label.length > 18 ? `${label.slice(0, 16)}…` : label;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Métodos de pago</CardTitle>
        <CardDescription>
          Registra las cuentas o apps con las que tus clientes pueden pagarte. Cada tienda tiene los suyos propios.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive py-4 text-center">{(error as Error).message}</p>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList
              className={cn(
                "flex h-auto w-full flex-wrap justify-start gap-1 bg-muted/60 p-1",
              )}
            >
              {methods.map((method) => (
                <TabsTrigger key={method.id} value={String(method.id)} className="shrink-0">
                  {tabLabel(method)}
                </TabsTrigger>
              ))}
              <TabsTrigger value={NEW_TAB} className="shrink-0 gap-1">
                <Plus className="h-3.5 w-3.5" />
                Agregar nuevo método
              </TabsTrigger>
            </TabsList>

            {methods.map((method) => (
              <TabsContent key={method.id} value={String(method.id)}>
                <PaymentMethodForm
                  storeId={storeId}
                  methodId={method.id}
                  initial={formFromMethod(method)}
                  onSaved={() => setActiveTab(String(method.id))}
                  onDeleted={() => {
                    const rest = methods.filter((m) => m.id !== method.id);
                    setActiveTab(rest.length > 0 ? String(rest[0].id) : NEW_TAB);
                  }}
                />
              </TabsContent>
            ))}

            <TabsContent value={NEW_TAB}>
              <PaymentMethodForm
                storeId={storeId}
                methodId={null}
                initial={emptyForm()}
                onSaved={(created) => {
                  setActiveTab(String(created.id));
                }}
              />
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
