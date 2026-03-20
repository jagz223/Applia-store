import { useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import {
  useProfessionalVerification,
  usePatchProfessionalVerificationImage,
  useVerifyingStatusMe,
} from "@/hooks/use-mango-data";
import { uploadVerificationIdImage } from "@/lib/firebase-client";
import { ArrowLeft, Loader2, Lock, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function VerifyProfessional() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const provider = user?.provider;
  const enabled = Boolean(isAuthenticated && provider);
  const { data: verification, isLoading: verLoading } = useProfessionalVerification(enabled);
  const patchImage = usePatchProfessionalVerificationImage();
  const { data: verifyingStatus, isLoading: verifyingStatusLoading } = useVerifyingStatusMe(enabled);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user?.id) return;
    setUploading(true);
    try {
      const url = await uploadVerificationIdImage(user.id, file);
      await patchImage.mutateAsync(url);
      toast({ title: "Documento enviado", description: "Tu identificación se guardó correctamente." });
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "No se pudo subir el archivo",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="container max-w-lg py-16 flex justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated || !provider) {
    return (
      <div className="container max-w-lg py-12 px-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground mb-4">Solo los profesionales pueden acceder a la verificación.</p>
            <Button asChild>
              <Link href="/login">Iniciar sesión</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const hasImage = Boolean(verification?.imageUrl?.trim());
  const hasPayment =
    Boolean(verification?.transferReceiptCode?.trim()) && Boolean(verification?.transferDate?.trim());

  const identificationVerifiedState = verifyingStatus?.identification_verified ?? "rejected";
  const transactionVerifiedState = verifyingStatus?.transacction_verified ?? "rejected";

  // Regla UI:
  // - pending/verified => carta "apagada" y sin edición
  // - rejected (o ausencia de doc) => carta "encendida" y editable
  const step1Locked =
    verifyingStatusLoading ||
    identificationVerifiedState === "pending" ||
    identificationVerifiedState === "verified";
  const step2Locked =
    verifyingStatusLoading ||
    transactionVerifiedState === "pending" ||
    transactionVerifiedState === "verified";

  return (
    <div className="container max-w-xl py-8 sm:py-12 px-4">
      <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground mb-6" asChild>
        <Link href="/">
          <ArrowLeft className="h-4 w-4" />
          Volver
        </Link>
      </Button>

      <h1 className="text-2xl font-bold tracking-tight mb-2">Pasos para verificarse</h1>
      <p className="text-muted-foreground text-sm mb-8">
        Completa ambos pasos. Cuando envíes todo, los datos quedarán bloqueados hasta que el equipo revise tu solicitud.
      </p>

      <div className="flex flex-col gap-4">
        <Card className={step1Locked ? "opacity-60 bg-muted/10" : ""}>
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="text-lg">Subir documento de identidad</CardTitle>
                <CardDescription>Sube una imagen clara de tu documento de identidad.</CardDescription>
              </div>
              {step1Locked ? <Lock className="h-5 w-5 text-muted-foreground shrink-0" /> : null}
            </div>
          </CardHeader>
          <CardContent>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              disabled={step1Locked || uploading || patchImage.isPending || verLoading || verifyingStatusLoading}
              onChange={handleFile}
            />
            {step1Locked ? (
              <p className="text-sm text-muted-foreground mb-3">Documento enviado. Esperando revisión.</p>
            ) : null}
            {!step1Locked && hasImage ? (
              <p className="text-sm text-muted-foreground mb-3">Ya subiste un documento. Puedes reemplazarlo.</p>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              disabled={step1Locked || uploading || patchImage.isPending || verLoading || verifyingStatusLoading}
              className="gap-2"
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading || patchImage.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Subir imagen
            </Button>
          </CardContent>
        </Card>

        <Card className={step2Locked ? "opacity-60 bg-muted/10" : ""}>
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="text-lg">Cuota por ser profesional</CardTitle>
                <CardDescription>
                  Es un pago de una sola vez (USD 15). Una vez verificado, ya estarás asociado a nosotros y
                  podrás ofrecer tu servicio de forma pública.
                </CardDescription>
              </div>
              {step2Locked ? <Lock className="h-5 w-5 text-muted-foreground shrink-0" /> : null}
            </div>
          </CardHeader>
          <CardContent className="flex justify-end">
            <Button
              type="button"
              disabled={step2Locked || verifyingStatusLoading}
              variant="default"
              onClick={() => setLocation("/professional/verify/payment")}
            >
              Continuar al pago
            </Button>
          </CardContent>
        </Card>
      </div>

      {hasPayment && verification?.transferDate ? (
        <p className="text-xs text-muted-foreground mt-6">
          Fecha de transferencia registrada: {verification.transferDate}
        </p>
      ) : null}
    </div>
  );
}
