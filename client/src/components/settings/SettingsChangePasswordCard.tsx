import { useState } from "react";
import { Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type SettingsChangePasswordCardProps = {
  className?: string;
  emailVerified?: boolean;
  hasPasswordProvider?: boolean;
};

const fieldClass =
  "h-11 rounded-2xl border-border/80 bg-muted/40 px-4 shadow-none focus-visible:ring-secondary dark:focus-visible:ring-primary";

export function SettingsChangePasswordCard({
  className,
  emailVerified = false,
  hasPasswordProvider = true,
}: SettingsChangePasswordCardProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(false);

  const canSubmit =
    currentPassword.length > 0 &&
    newPassword.length >= 6 &&
    newPassword === confirmPassword;

  const reset = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch("/api/auth/password", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { message?: string }).message || "No se pudo actualizar");
      reset();
      setOpen(false);
      toast({ title: "Listo", description: "Tu contraseña quedó actualizada." });
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "No se pudo cambiar",
        description: e instanceof Error ? e.message : "Error desconocido",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={cn("rounded-2xl border border-border/70 bg-card p-4", className)}>
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
          <KeyRound className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium">Contraseña</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            {!hasPasswordProvider
              ? "Tu cuenta usa Google o Facebook. No hay contraseña local."
              : emailVerified
                ? "Cambia tu contraseña con la actual, o usa recuperar por correo."
                : "Confirma tu correo para poder recuperarla por email si la olvidas."}
          </p>
          {hasPasswordProvider ? (
            <Button
              type="button"
              variant="outline"
              className="mt-3 rounded-full"
              onClick={() => setOpen(true)}
            >
              Cambiar contraseña
            </Button>
          ) : null}
        </div>
      </div>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next && !loading) reset();
          setOpen(next);
        }}
      >
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cambiar contraseña</DialogTitle>
            <DialogDescription>Introduce tu contraseña actual y la nueva.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label htmlFor="current-password">Contraseña actual</Label>
              <div className="relative">
                <Input
                  id="current-password"
                  type={showCurrent ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className={fieldClass}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  onClick={() => setShowCurrent((v) => !v)}
                >
                  {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">Nueva</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showNew ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={fieldClass}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  onClick={() => setShowNew((v) => !v)}
                >
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirmar</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={fieldClass}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              className="rounded-full"
              disabled={!canSubmit || loading}
              onClick={() => void handleSubmit()}
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
