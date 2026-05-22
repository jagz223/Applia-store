import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Loader2, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  RecoveryQuestionsForm,
  type RecoveryAnswerDraft,
} from "@/components/account-recovery/RecoveryQuestionsForm";
import { useNoIndex } from "@/hooks/use-no-index";

type Step = "email" | "questions" | "password" | "done";

const emptyDraft = (): [RecoveryAnswerDraft, RecoveryAnswerDraft, RecoveryAnswerDraft] => [
  { questionId: "", answer: "" },
  { questionId: "", answer: "" },
  { questionId: "", answer: "" },
];

export default function ForgotPassword() {
  useNoIndex();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [draft, setDraft] = useState(emptyDraft);
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const lookupEmail = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Error al buscar cuenta");
      if (!data.found) {
        toast({
          title: "Revisa tu correo",
          description: data.message ?? "Si el correo está registrado, podrás continuar con las preguntas.",
        });
        return;
      }
      setDraft(emptyDraft());
      setStep("questions");
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Error",
        description: e instanceof Error ? e.message : "No se pudo continuar.",
      });
    } finally {
      setLoading(false);
    }
  };

  const verifyAnswers = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          answers: draft.map((d) => ({ questionId: d.questionId, answer: d.answer.trim() })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Preguntas o respuestas incorrectas");
      setResetToken(String(data.resetToken ?? ""));
      setStep("password");
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "No coinciden",
        description:
          e instanceof Error
            ? e.message
            : "Debes elegir las mismas 3 preguntas que configuraste y escribir las respuestas correctas.",
      });
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async () => {
    if (newPassword.length < 6) {
      toast({ variant: "destructive", title: "Contraseña corta", description: "Mínimo 6 caracteres." });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ variant: "destructive", title: "No coinciden", description: "Las contraseñas deben ser iguales." });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetToken, newPassword, confirmPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "No se pudo cambiar la contraseña");
      setStep("done");
      toast({
        title: "Contraseña actualizada",
        description: "Recibirás una notificación en la app. Ya puedes iniciar sesión.",
      });
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Error",
        description: e instanceof Error ? e.message : "No se pudo restablecer la contraseña.",
      });
    } finally {
      setLoading(false);
    }
  };

  const canVerify =
    draft.every((d) => d.questionId && d.answer.trim().length >= 2) &&
    new Set(draft.map((d) => d.questionId)).size === 3;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-mango-orange/20 via-background to-mango-green/20 p-4">
      <Card className="w-full max-w-xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
            <KeyRound className="h-5 w-5 text-primary" />
          </div>
          <CardTitle>Recuperar contraseña</CardTitle>
          <CardDescription>
            {step === "email" && "Ingresa el correo de tu cuenta."}
            {step === "questions" &&
              "Elige las 3 preguntas que configuraste al registrarte y escribe la misma respuesta que guardaste."}
            {step === "password" && "Elige una contraseña nueva."}
            {step === "done" && "Listo. Tu contraseña fue actualizada."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === "email" ? (
            <div className="space-y-2">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="correo@ejemplo.com"
                autoComplete="email"
              />
            </div>
          ) : null}

          {step === "questions" ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Cuenta: <span className="font-medium text-foreground">{email}</span>
              </p>
              <p className="text-sm text-muted-foreground rounded-lg border border-dashed border-border/80 bg-muted/20 px-3 py-2">
                No mostramos cuáles elegiste antes: selecciona tú las tres preguntas correctas del listado (por
                ejemplo, «nombre de tu primera mascota») y responde exactamente como lo hiciste al configurarlas.
              </p>
              <RecoveryQuestionsForm value={draft} onChange={setDraft} disabled={loading} />
            </div>
          ) : null}

          {step === "password" ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Nueva contraseña</Label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Confirmar contraseña</Label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
            </div>
          ) : null}

          {step === "done" ? (
            <p className="text-sm text-center text-muted-foreground">
              Te enviamos una notificación confirmando el cambio (aunque no tengas sesión iniciada, la verás al entrar).
            </p>
          ) : null}
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          {step === "email" ? (
            <Button className="w-full" onClick={lookupEmail} disabled={loading || !email.trim()}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Continuar
            </Button>
          ) : null}
          {step === "questions" ? (
            <Button className="w-full" onClick={verifyAnswers} disabled={loading || !canVerify}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Verificar preguntas y respuestas
            </Button>
          ) : null}
          {step === "password" ? (
            <Button className="w-full" onClick={resetPassword} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Guardar nueva contraseña
            </Button>
          ) : null}
          {step === "done" ? (
            <Button className="w-full" onClick={() => setLocation("/login")}>
              Ir a iniciar sesión
            </Button>
          ) : null}
          <p className="text-center text-sm text-muted-foreground">
            <Link href="/login" className="text-mango-orange hover:underline font-medium">
              Volver al inicio de sesión
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
