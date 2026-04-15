import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import {
  useProfessionalVerification,
  usePatchProfessionalVerificationImage,
  usePatchProfessionalVerificationCredential,
  useVerifyingStatusMe,
} from "@/hooks/use-mango-data";
import { uploadProfessionalCredential, uploadVerificationIdImage } from "@/lib/firebase-client";
import { ArrowLeft, ExternalLink, FileText, Loader2, Lock, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { consumeVerifyReturnPath, ensureDefaultVerifyReturnPath } from "@/lib/verify-return-path";

type UploadedKind = "image" | "pdf" | "office" | "unknown";

function inferKindFromStorageUrl(url: string): UploadedKind {
  try {
    const u = new URL(url);
    const afterO = u.pathname.includes("/o/") ? decodeURIComponent(u.pathname.split("/o/")[1] ?? "") : "";
    const seg = afterO.split("/").pop() || "";
    const ext = seg.includes(".") ? seg.split(".").pop()?.toLowerCase() ?? "" : "";
    if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) return "image";
    if (ext === "pdf") return "pdf";
    if (ext === "doc" || ext === "docx") return "office";
  } catch {
    /* ignore */
  }
  return "unknown";
}

function kindFromMime(mime: string | null | undefined): UploadedKind | null {
  if (!mime) return null;
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "pdf";
  if (mime === "application/msword" || mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return "office";
  }
  return null;
}

function UploadedMiniPreview(props: {
  url: string;
  fileNameHint?: string | null;
  mimeHint?: string | null;
  label: string;
}) {
  const { url, fileNameHint, mimeHint, label } = props;
  const kind = kindFromMime(mimeHint) ?? inferKindFromStorageUrl(url);

  if (kind === "image") {
    return (
      <div className="mt-3 rounded-lg border bg-muted/30 p-1 max-w-xs overflow-hidden">
        <a href={url} target="_blank" rel="noopener noreferrer" className="block outline-none focus-visible:ring-2 ring-ring rounded-md">
          <img src={url} alt={label} className="w-full max-h-44 object-contain bg-background/50" loading="lazy" />
        </a>
        <p className="text-xs text-muted-foreground px-1 py-1.5 truncate" title={fileNameHint ?? undefined}>
          {fileNameHint ?? "Imagen"}
        </p>
      </div>
    );
  }

  if (kind === "pdf") {
    return (
      <div className="mt-3 rounded-lg border bg-muted/20 overflow-hidden max-w-sm">
        <iframe title={label} src={url} className="w-full h-44 border-0 bg-background/80" />
        <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-t bg-muted/30 text-xs">
          <span className="truncate text-muted-foreground" title={fileNameHint ?? undefined}>
            {fileNameHint ?? "PDF"}
          </span>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 shrink-0 text-primary hover:underline"
          >
            Abrir <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    );
  }

  const displayName = fileNameHint ?? "Documento";
  return (
    <div className="mt-3 flex items-center gap-3 rounded-lg border bg-muted/30 p-3 max-w-sm">
      <FileText className="h-10 w-10 text-muted-foreground shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate" title={displayName}>
          {displayName}
        </p>
        <p className="text-xs text-muted-foreground">
          {kind === "office" ? "Word" : "Archivo"} · Vista previa no disponible
        </p>
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary inline-flex items-center gap-1 mt-1 hover:underline">
          Abrir archivo <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}

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
  const patchCredential = usePatchProfessionalVerificationCredential();
  const { data: verifyingStatus, isLoading: verifyingStatusLoading } = useVerifyingStatusMe(enabled);

  useEffect(() => {
    ensureDefaultVerifyReturnPath();
  }, []);

  /** Documento y pago enviados y en revisión: volver a la pantalla previa (el banner sigue hasta que admin verifique). */
  useEffect(() => {
    if (verLoading || verifyingStatusLoading || !verifyingStatus) return;
    if (verifyingStatus.identification_verified !== "pending") return;
    if (verifyingStatus.transacction_verified !== "pending") return;
    setLocation(consumeVerifyReturnPath());
  }, [verLoading, verifyingStatusLoading, verifyingStatus, setLocation]);

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

  const credentialInputRef = useRef<HTMLInputElement>(null);
  const [uploadingCredential, setUploadingCredential] = useState(false);
  const [credentialUploadMeta, setCredentialUploadMeta] = useState<{ fileName: string; mimeType: string } | null>(null);
  const handleCredentialFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user?.id) return;
    setUploadingCredential(true);
    try {
      const url = await uploadProfessionalCredential(user.id, file);
      await patchCredential.mutateAsync({
        professionalCredentialUrl: url,
        name: file.name,
        mimeType: file.type,
        size: file.size,
      });
      setCredentialUploadMeta({ fileName: file.name, mimeType: file.type });
      toast({
        title: "Documento profesional enviado",
        description: "Se guardó en Mis documentos. El admin lo verá en tu verificación.",
      });
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "No se pudo subir el archivo",
        variant: "destructive",
      });
    } finally {
      setUploadingCredential(false);
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
  const hasCredential = Boolean(verification?.professionalCredentialUrl?.trim());
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
                <CardDescription>
                  Sube una copia legible de tu documento de identidad (foto o escaneado).
                </CardDescription>
              </div>
              {step1Locked ? <Lock className="h-5 w-5 text-muted-foreground shrink-0" /> : null}
            </div>
          </CardHeader>
          <CardContent>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,.jpg,.jpeg,.png"
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
            {hasImage && verification?.imageUrl ? (
              <UploadedMiniPreview
                url={verification.imageUrl}
                label="Vista previa del documento de identidad"
                fileNameHint="Documento de identidad"
              />
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
              Subir documento
            </Button>
            <p className="text-xs text-muted-foreground mt-2">Solo JPG o PNG.</p>
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

        <Card className={uploadingCredential || patchCredential.isPending ? "opacity-90" : ""}>
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="text-lg">Documento profesional</CardTitle>
                <CardDescription>
                  Sube un certificado, título universitario o documento que avale tu profesión. Es requerido para la verificación.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <input
              ref={credentialInputRef}
              type="file"
              accept="image/jpeg,image/png,application/pdf,.pdf"
              className="hidden"
              disabled={uploadingCredential || patchCredential.isPending}
              onChange={handleCredentialFile}
            />
            {hasCredential ? (
              <p className="text-sm text-muted-foreground mb-3">Documento enviado. Puedes reemplazarlo si lo necesitas.</p>
            ) : (
              <p className="text-sm text-muted-foreground mb-3">
                Si no lo tienes ahora, puedes volver después y subirlo. Se guardará en Mis documentos.
              </p>
            )}
            {hasCredential && verification?.professionalCredentialUrl ? (
              <UploadedMiniPreview
                url={verification.professionalCredentialUrl}
                mimeHint={credentialUploadMeta?.mimeType}
                fileNameHint={credentialUploadMeta?.fileName}
                label="Vista previa del documento profesional"
              />
            ) : null}
            <Button
              type="button"
              variant="secondary"
              disabled={uploadingCredential || patchCredential.isPending}
              className="gap-2"
              onClick={() => credentialInputRef.current?.click()}
            >
              {uploadingCredential || patchCredential.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Subir documento
            </Button>
            <p className="text-xs text-muted-foreground mt-2">Puedes subir JPG, PNG o PDF sin problema.</p>
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
