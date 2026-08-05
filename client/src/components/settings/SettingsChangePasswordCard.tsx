import { useState } from "react";
import { Link } from "wouter";
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
import {
  RecoveryQuestionsForm,
  type RecoveryAnswerDraft,
} from "@/components/account-recovery/RecoveryQuestionsForm";
import { SETTINGS_WRONG_RECOVERY_MSG } from "@shared/account-recovery";
import { cn } from "@/lib/utils";

const emptyDraft = (): [RecoveryAnswerDraft, RecoveryAnswerDraft, RecoveryAnswerDraft] => [
  { questionId: "", answer: "" },
  { questionId: "", answer: "" },
  { questionId: "", answer: "" },
];

function resetFormState(
  setDraft: (v: [RecoveryAnswerDraft, RecoveryAnswerDraft, RecoveryAnswerDraft]) => void,
  setNewPassword: (v: string) => void,
  setConfirmPassword: (v: string) => void,
) {
  setDraft(emptyDraft());
  setNewPassword("");
  setConfirmPassword("");
}

type SettingsChangePasswordCardProps = {
  recoveryConfigured: boolean;
  className?: string;
};

const fieldClass =
  "h-11 rounded-2xl border-border/80 bg-muted/40 px-4 shadow-none focus-visible:ring-secondary dark:focus-visible:ring-primary";

export function SettingsChangePasswordCard({
  recoveryConfigured,
  className,
}: SettingsChangePasswordCardProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const canSubmit =
    draft.every((d) => d.questionId && d.answer.trim().length >= 2) &&
    new Set(draft.map((d) => d.questionId)).size === 3 &&
    newPassword.length >= 6 &&
    newPassword === confirmPassword;

  const handleOpenChange = (next: boolean) => {
    if (!next && !loading) {
      resetFormState(setDraft, setNewPassword, setConfirmPassword);
    }
    setOpen(next);
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch("/api/auth/password-with-recovery", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          answers: draft.map((d) => ({ questionId: d.questionId, answer: d.answer.trim() })),
          newPassword,
          confirmPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401) {
          setDraft(emptyDraft());
          toast({
            variant: "destructive",
            title: "No coincide",
            description: SETTINGS_WRONG_RECOVERY_MSG,
          });
          return;
        }
        throw new Error(data.message || "No se pudo actualizar la contraseña");
      }
      resetFormState(setDraft, setNewPassword, setConfirmPassword);
      setOpen(false);
      toast({
        title: "Listo",
        description: "Tu contraseña quedó actualizada.",
      });
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "No se pudo cambiar",
        description:
          e instanceof Error ? e.message : "Revisa la nueva contraseña e inténtalo de nuevo.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <section
        className={cn(
          "rounded-[1.5rem] border border-border/70 bg-card/90 p-5 shadow-sm backdrop-blur-sm",
          className,
        )}
      >
        <div className="mb-4 flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground dark:bg-primary dark:text-primary-foreground">
            <KeyRound className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-base font-bold tracking-tight text-foreground">Contraseña</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Para cambiarla, confirma con tus preguntas de seguridad.
            </p>
          </div>
        </div>
        {!recoveryConfigured ? (
          <p className="rounded-2xl border border-dashed border-border/80 bg-muted/25 px-4 py-3 text-sm text-muted-foreground">
            Primero arma tus{" "}
            <Link
              href="/account-recovery/setup?next=/settings"
              className="font-semibold text-secondary underline-offset-4 hover:underline dark:text-primary"
            >
              preguntas de seguridad
            </Link>
            . Después podrás renovar la clave desde aquí.
          </p>
        ) : (
          <Button type="button" className="h-10 rounded-full px-5 font-semibold" onClick={() => setOpen(true)}>
            Cambiar contraseña
          </Button>
        )}
      </section>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="flex max-h-[min(90vh,720px)] max-w-lg flex-col gap-0 rounded-[1.5rem] p-0">
          <DialogHeader className="shrink-0 border-b border-border/60 px-6 py-4">
            <DialogTitle className="font-display">Nueva contraseña</DialogTitle>
            <DialogDescription>
              Responde tus 3 preguntas y escribe la clave nueva (mínimo 6 caracteres).
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
            <RecoveryQuestionsForm value={draft} onChange={setDraft} disabled={loading} />
            <div className="grid gap-3 border-t border-border/60 pt-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Nueva contraseña</Label>
                <div className="relative">
                  <Input
                    type={showNew ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                    disabled={loading}
                    className={cn(fieldClass, "pr-11")}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full hover:bg-transparent"
                    onClick={() => setShowNew(!showNew)}
                    tabIndex={-1}
                  >
                    {showNew ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Confirmar</Label>
                <div className="relative">
                  <Input
                    type={showConfirm ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    disabled={loading}
                    className={cn(fieldClass, "pr-11")}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full hover:bg-transparent"
                    onClick={() => setShowConfirm(!showConfirm)}
                    tabIndex={-1}
                  >
                    {showConfirm ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="shrink-0 gap-2 border-t border-border/60 px-6 py-4 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => handleOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="rounded-full font-semibold"
              onClick={handleSubmit}
              disabled={!canSubmit || loading}
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
