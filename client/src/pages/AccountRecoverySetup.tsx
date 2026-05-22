import { useMemo, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { RecoveryQuestionsForm, type RecoveryAnswerDraft } from "@/components/account-recovery/RecoveryQuestionsForm";
import { useNoIndex } from "@/hooks/use-no-index";

const emptyDraft = (): [RecoveryAnswerDraft, RecoveryAnswerDraft, RecoveryAnswerDraft] => [
  { questionId: "", answer: "" },
  { questionId: "", answer: "" },
  { questionId: "", answer: "" },
];

export default function AccountRecoverySetup() {
  useNoIndex();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { toast } = useToast();
  const { user, setUser, isLoading: authLoading } = useAuth();
  const [draft, setDraft] = useState(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);

  const reconfigure = useMemo(() => {
    const q = new URLSearchParams(search || "");
    return q.get("reconfigure") === "1";
  }, [search]);

  const nextHref = useMemo(() => {
    const q = new URLSearchParams(search || "");
    const raw = q.get("next");
    if (!raw) return "/";
    try {
      const decoded = decodeURIComponent(raw);
      if (decoded.startsWith("/") && !decoded.startsWith("//")) return decoded;
    } catch {
      /* noop */
    }
    return "/";
  }, [search]);

  const canSubmit =
    draft.every((d) => d.questionId && d.answer.trim().length >= 2) &&
    new Set(draft.map((d) => d.questionId)).size === 3;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch("/api/auth/recovery-questions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          answers: draft.map((d) => ({ questionId: d.questionId, answer: d.answer.trim() })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "No se pudieron guardar las preguntas");
      if (data.user) setUser(data.user);
      if (reconfigure) {
        toast({ title: "Preguntas actualizadas", description: "Tus nuevas respuestas ya están activas." });
        setLocation("/settings");
        return;
      }
      setReminderOpen(true);
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Error",
        description: e instanceof Error ? e.message : "No se pudieron guardar las preguntas.",
      });
    } finally {
      setSaving(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container max-w-lg mx-auto py-12 px-4 text-center">
        <p className="text-muted-foreground mb-4">Debes iniciar sesión para configurar tus preguntas.</p>
        <Button asChild>
          <Link href="/login">Iniciar sesión</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-mango-orange/15 via-background to-mango-green/15 p-4">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <ShieldCheck className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-center text-xl">
            {reconfigure ? "Actualizar preguntas de recuperación" : "Protege tu cuenta"}
          </CardTitle>
          <CardDescription className="text-center">
            {reconfigure
              ? "El administrador aprobó tu solicitud. Configura 3 preguntas nuevas que solo tú conozcas."
              : "Antes de continuar, elige 3 preguntas de seguridad y escribe tus respuestas. Las usarás si olvidas tu contraseña."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RecoveryQuestionsForm value={draft} onChange={setDraft} disabled={saving} />
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
          <Button className="w-full" disabled={!canSubmit || saving} onClick={submit}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Guardar preguntas y continuar
          </Button>
        </CardFooter>
      </Card>

      <AlertDialog open={reminderOpen} onOpenChange={setReminderOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Guarda esta información</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-left">
              <p>
                Tus respuestas son la única forma de recuperar la cuenta si olvidas la contraseña. Anótalas en un
                lugar seguro (no compartas las respuestas con nadie).
              </p>
              <p className="font-medium text-foreground">
                Sin estas respuestas, el equipo de soporte no podrá restablecer tu acceso automáticamente.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Revisar de nuevo</AlertDialogCancel>
            <AlertDialogAction onClick={() => setLocation(nextHref)}>Entendido, continuar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
