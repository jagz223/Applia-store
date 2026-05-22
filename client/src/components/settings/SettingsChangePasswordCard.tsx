import { useState } from "react";
import { Link } from "wouter";
import { Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
};

export function SettingsChangePasswordCard({ recoveryConfigured }: SettingsChangePasswordCardProps) {
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
      if (!res.ok) throw new Error(data.message || "No se pudo cambiar la contraseña");
      resetFormState(setDraft, setNewPassword, setConfirmPassword);
      setOpen(false);
      toast({
        title: "Contraseña actualizada",
        description: "Tu nueva contraseña ya está activa. Recibirás una notificación de confirmación.",
      });
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "No se pudo cambiar",
        description:
          e instanceof Error
            ? e.message
            : "Verifica las preguntas, las respuestas y la nueva contraseña.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            Contraseña
          </CardTitle>
          <CardDescription>
            Cambia tu contraseña verificando tus preguntas de seguridad (las mismas que configuraste al
            registrarte).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!recoveryConfigured ? (
            <p className="text-sm text-muted-foreground rounded-lg border border-dashed border-border/80 bg-muted/20 px-3 py-3">
              Primero configura tus{" "}
              <Link href="/account-recovery/setup?next=/settings" className="text-primary font-medium hover:underline">
                preguntas de recuperación
              </Link>{" "}
              para poder cambiar la contraseña.
            </p>
          ) : (
            <Button type="button" onClick={() => setOpen(true)}>
              Cambiar contraseña
            </Button>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-lg max-h-[min(90vh,720px)] flex flex-col gap-0 p-0">
          <DialogHeader className="shrink-0 border-b border-border/60 px-6 py-4">
            <DialogTitle>Cambiar contraseña</DialogTitle>
            <DialogDescription>
              Elige tus 3 preguntas de seguridad, responde correctamente y define la nueva contraseña.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Selecciona del listado las mismas preguntas que elegiste al registrarte.
            </p>
            <RecoveryQuestionsForm value={draft} onChange={setDraft} disabled={loading} />
            <div className="grid gap-3 sm:grid-cols-2 border-t border-border/60 pt-2">
              <div className="space-y-1.5">
                <Label>Nueva contraseña</Label>
                <div className="relative">
                  <Input
                    type={showNew ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                    disabled={loading}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
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
                <Label>Confirmar contraseña</Label>
                <div className="relative">
                  <Input
                    type={showConfirm ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    disabled={loading}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
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
          <DialogFooter className="shrink-0 border-t border-border/60 px-6 py-4 gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={!canSubmit || loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Guardar nueva contraseña
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
