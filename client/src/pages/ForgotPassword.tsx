import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Loader2, KeyRound, Mail, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  RecoveryQuestionsForm,
  type RecoveryAnswerDraft,
} from "@/components/account-recovery/RecoveryQuestionsForm";
import { useNoIndex } from "@/hooks/use-no-index";
import {
  FORGOT_PASSWORD_NOT_REGISTERED_MSG,
  FORGOT_PASSWORD_WRONG_RECOVERY_CODE,
  FORGOT_PASSWORD_WRONG_RECOVERY_MSG,
} from "@shared/account-recovery";
import { normalizePhone } from "@shared/admin-user-registration";
import { cn } from "@/lib/utils";

type Step = "identifier" | "questions" | "password" | "done";
type IdentifierMode = "email" | "phone";

const emptyDraft = (): [RecoveryAnswerDraft, RecoveryAnswerDraft, RecoveryAnswerDraft] => [
  { questionId: "", answer: "" },
  { questionId: "", answer: "" },
  { questionId: "", answer: "" },
];

export default function ForgotPassword() {
  useNoIndex();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("identifier");
  const [identifierMode, setIdentifierMode] = useState<IdentifierMode>("email");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [identifierHint, setIdentifierHint] = useState("");
  const [identifierError, setIdentifierError] = useState("");
  const [draft, setDraft] = useState(emptyDraft);
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const resetToIdentifier = (message: string) => {
    setStep("identifier");
    setDraft(emptyDraft());
    setResetToken("");
    setNewPassword("");
    setConfirmPassword("");
    setIdentifierError(message);
  };

  const lookupIdentifier = async () => {
    setIdentifierError("");
    const body =
      identifierMode === "email"
        ? { email: email.trim().toLowerCase() }
        : { phone: normalizePhone(phone) };

    if (identifierMode === "email" && !email.trim()) return;
    if (identifierMode === "phone" && !normalizePhone(phone)) return;

    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Error al buscar cuenta");
      if (!data.found) {
        setIdentifierError(String(data.message ?? FORGOT_PASSWORD_NOT_REGISTERED_MSG));
        return;
      }
      const resolvedEmail = String(data.accountEmail ?? "").trim().toLowerCase();
      if (!resolvedEmail) {
        setIdentifierError(FORGOT_PASSWORD_NOT_REGISTERED_MSG);
        return;
      }
      setAccountEmail(resolvedEmail);
      setIdentifierHint(
        identifierMode === "email"
          ? email.trim().toLowerCase()
          : normalizePhone(phone),
      );
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
          email: accountEmail,
          answers: draft.map((d) => ({ questionId: d.questionId, answer: d.answer.trim() })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = String(data.message ?? FORGOT_PASSWORD_WRONG_RECOVERY_MSG);
        if (data.code === FORGOT_PASSWORD_WRONG_RECOVERY_CODE || res.status === 401) {
          resetToIdentifier(msg);
          toast({
            variant: "destructive",
            title: "Datos incorrectos",
            description: msg,
          });
          return;
        }
        throw new Error(msg);
      }
      setResetToken(String(data.resetToken ?? ""));
      setIdentifierError("");
      setStep("password");
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Error",
        description: e instanceof Error ? e.message : "No se pudo verificar.",
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

  const canLookup =
    identifierMode === "email" ? email.trim().length > 0 : normalizePhone(phone).length >= 8;

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
            {step === "identifier" && "Ingresa el correo o el número de teléfono de tu cuenta."}
            {step === "questions" &&
              "Elige las 3 preguntas que configuraste al registrarte y escribe la misma respuesta que guardaste."}
            {step === "password" && "Elige una contraseña nueva."}
            {step === "done" && "Listo. Tu contraseña fue actualizada."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === "identifier" ? (
            <div className="space-y-3">
              <Tabs
                value={identifierMode}
                onValueChange={(v) => {
                  setIdentifierMode(v as IdentifierMode);
                  setIdentifierError("");
                }}
              >
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="email" className="gap-2">
                    <Mail className="h-4 w-4 shrink-0" aria-hidden />
                    Correo
                  </TabsTrigger>
                  <TabsTrigger value="phone" className="gap-2">
                    <Phone className="h-4 w-4 shrink-0" aria-hidden />
                    Teléfono
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="email" className="mt-3 space-y-2">
                  <Label htmlFor="forgot-email">Correo electrónico</Label>
                  <Input
                    id="forgot-email"
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setIdentifierError("");
                    }}
                    placeholder="correo@ejemplo.com"
                    autoComplete="email"
                  />
                </TabsContent>
                <TabsContent value="phone" className="mt-3 space-y-2">
                  <Label htmlFor="forgot-phone">Número de teléfono</Label>
                  <Input
                    id="forgot-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      setIdentifierError("");
                    }}
                    placeholder="+593 99 123 4567"
                    autoComplete="tel"
                  />
                  <p className="text-xs text-muted-foreground">
                    Usa el mismo número que registraste (con código de país si lo guardaste así).
                  </p>
                </TabsContent>
              </Tabs>
              {identifierError ? (
                <p
                  className={cn(
                    "text-sm rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive",
                  )}
                  role="alert"
                >
                  {identifierError}
                </p>
              ) : null}
            </div>
          ) : null}

          {step === "questions" ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Cuenta verificada:{" "}
                <span className="font-medium text-foreground">
                  {identifierMode === "phone" ? identifierHint : accountEmail}
                </span>
              </p>
              <p className="text-sm text-muted-foreground rounded-lg border border-dashed border-border/80 bg-muted/20 px-3 py-2">
                No mostramos cuáles elegiste antes: selecciona tú las tres preguntas correctas del listado y
                responde exactamente como lo hiciste al configurarlas.
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
          {step === "identifier" ? (
            <Button className="w-full" onClick={lookupIdentifier} disabled={loading || !canLookup}>
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
