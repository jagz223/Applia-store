import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import {
  useProfessionalVerification,
  usePatchProfessionalVerificationImage,
  usePatchProfessionalVerificationCredential,
  useVerifyingStatusMe,
  useCurrentProvider,
  useCategories,
} from "@/hooks/use-mango-data";
import { isCarGoProvider } from "@shared/provider-car-go";
import { MAN_GO_CATEGORY_SLUG, normalizeProviderCategorySlug } from "@shared/default-categories";
import { useProviderSubscriptionMonthlyUsd } from "@/hooks/use-provider-subscription-monthly-usd";
import { uploadProfessionalCredential, uploadVerificationIdImage } from "@/lib/firebase-client";
import { ArrowLeft, ExternalLink, FileText, Loader2, Lock, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  consumeVerifyReturnPath,
  ensureDefaultVerifyReturnPath,
  VERIFY_PAYMENT_PATH,
} from "@/lib/verify-return-path";

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
  const credentialInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadingCredential, setUploadingCredential] = useState(false);
  const [credentialUploadMeta, setCredentialUploadMeta] = useState<{ fileName: string; mimeType: string } | null>(null);

  const { data: currentProvider } = useCurrentProvider();
  const { data: categories = [] } = useCategories();
  const provider = currentProvider ?? user?.provider;
  // Nota: internamente detectamos la marca `transport`, pero en UI mostramos "movilidad" (Taxi/Delivery/Marketplace).
  const isCarGo = useMemo(() => isCarGoProvider(provider ?? undefined, categories), [provider, categories]);
  const enabled = Boolean(isAuthenticated && provider);
  const { data: verification, isLoading: verLoading } = useProfessionalVerification(enabled);
  const patchImage = usePatchProfessionalVerificationImage();
  const patchCredential = usePatchProfessionalVerificationCredential();
  const { data: verifyingStatus, isLoading: verifyingStatusLoading } = useVerifyingStatusMe(enabled);
  const isRenewalSimple = (provider as any)?.isVerified === true;
  const { monthlyUsdLabel } = useProviderSubscriptionMonthlyUsd({ enabled });
  const categorySlug = useMemo(() => {
    const direct = typeof (provider as any)?.category === "string" ? String((provider as any).category).trim() : "";
    if (direct) return direct;
    const id = Number((provider as any)?.categoryId);
    if (!Number.isFinite(id)) return "";
    const cat = categories.find((c: any) => Number(c?.id) === id);
    return typeof (cat as any)?.slug === "string" ? String((cat as any).slug).trim() : "";
  }, [provider, categories]);
  const providerCategorySlug = normalizeProviderCategorySlug(categorySlug);
  const isManGo = providerCategorySlug === MAN_GO_CATEGORY_SLUG;

  const credentialCopy = useMemo(() => {
    if (isCarGo) {
      return {
        stepLabel: "Licencia de conducir",
        cardTitle: "Licencia de conducir",
        description:
          "Sube una foto o PDF legible de tu licencia de conducir vigente (anverso y reverso en un solo archivo si aplica). Es requerida para operar en servicios de movilidad.",
        uploadName: "Licencia de conducir",
        toastTitle: "Licencia de conducir enviada",
        sentHint: "Licencia enviada. Puedes reemplazarla si lo necesitas.",
        previewLabel: "Vista previa de la licencia de conducir",
        step2Noun: "licencia",
      };
    }
    if (isManGo) {
      return {
        stepLabel: "Documento o certificación de curso",
        cardTitle: "Documento o certificación de curso",
        description:
          "Sube un documento o certificación de curso, taller o capacitación técnica que avale tu oficio (carné habilitado, constancia, etc.). Es requerido para la verificación.",
        uploadName: "Certificación de curso",
        toastTitle: "Documento enviado",
        sentHint: "Documento enviado. Puedes reemplazarlo si lo necesitas.",
        previewLabel: "Vista previa del documento o certificación",
        step2Noun: "documento o certificación de curso",
      };
    }
    return {
      stepLabel: "Documento profesional",
      cardTitle: "Documento profesional",
      description:
        "Sube un certificado, título universitario o documento que avale tu profesión. Es requerido para la verificación.",
      uploadName: "Documento profesional",
      toastTitle: "Documento profesional enviado",
      sentHint: "Documento enviado. Puedes reemplazarlo si lo necesitas.",
      previewLabel: "Vista previa del documento profesional",
      step2Noun: "documento profesional",
    };
  }, [isCarGo, isManGo]);

  useEffect(() => {
    ensureDefaultVerifyReturnPath();
  }, []);

  const hasImage = Boolean(verification?.imageUrl?.trim());
  const hasCredential = Boolean(verification?.professionalCredentialUrl?.trim());
  const hasPayment =
    Boolean(verification?.transferReceiptCode?.trim()) && Boolean(verification?.transferDate?.trim());

  /** Renovación: no usar pantalla intermedia; ir directo al pago o al panel si ya hay comprobante en revisión. */
  useEffect(() => {
    if (!isRenewalSimple || verLoading || verifyingStatusLoading) return;
    if (verifyingStatus?.transacction_verified === "pending") {
      setLocation(consumeVerifyReturnPath());
      return;
    }
    setLocation(VERIFY_PAYMENT_PATH);
  }, [isRenewalSimple, verLoading, verifyingStatusLoading, verifyingStatus, setLocation]);

  /** Alta inicial: documento y pago en revisión → volver a la pantalla previa. */
  useEffect(() => {
    if (isRenewalSimple || verLoading || verifyingStatusLoading || !verifyingStatus) return;
    const txPending = verifyingStatus.transacction_verified === "pending";
    if (!txPending) return;
    const idPending = verifyingStatus.identification_verified === "pending";
    if (!idPending) return;
    if (!hasImage || !hasCredential || !hasPayment) return;
    setLocation(consumeVerifyReturnPath());
  }, [
    verLoading,
    verifyingStatusLoading,
    verifyingStatus,
    isRenewalSimple,
    setLocation,
    hasImage,
    hasCredential,
    hasPayment,
  ]);

  const paymentUnlockReminder = useMemo(() => {
    if (isRenewalSimple) return null;
    if (!hasImage) {
      return {
        headline: "Paso 1 de 3 · Documento de identidad",
        detail: isCarGo
          ? "Primero sube tu documento de identidad en la tarjeta de arriba. Después podrás subir la licencia y, al final, el pago."
          : isManGo
            ? "Primero sube tu documento de identidad en la tarjeta de arriba. Después podrás subir tu documento o certificación de curso y, al final, el pago."
            : "Primero sube tu documento de identidad en la tarjeta de arriba. Después podrás subir tu documento profesional y, al final, el pago.",
      };
    }
    if (!hasCredential) {
      return {
        headline: `Paso 2 de 3 · ${credentialCopy.stepLabel}`,
        detail: `Ya tienes la identidad. Sube tu ${credentialCopy.step2Noun} en la segunda tarjeta. El botón de pago se habilita cuando ambos documentos estén listos.`,
      };
    }
    return {
      headline: "Paso 3 de 3 · Cuota",
      detail:
        "Documentación completa. Continúa al pago para registrar la cuota; el equipo revisará todo junto.",
    };
  }, [isRenewalSimple, hasImage, hasCredential, isCarGo, isManGo, credentialCopy]);

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

  const handleCredentialFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user?.id) return;
    setUploadingCredential(true);
    try {
      const url = await uploadProfessionalCredential(user.id, file);
      await patchCredential.mutateAsync({
        professionalCredentialUrl: url,
        name: isCarGo || isManGo ? credentialCopy.uploadName : file.name,
        mimeType: file.type,
        size: file.size,
      });
      setCredentialUploadMeta({ fileName: file.name, mimeType: file.type });
      toast({
        title: credentialCopy.toastTitle,
        description: isCarGo
          ? "Se guardó en Mis documentos. Cuando también registres el pago, el equipo podrá revisar todo junto."
          : "Se guardó en Mis documentos. Cuando completes identificación, este documento y el pago, el equipo revisará tu solicitud.",
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

  const identificationVerifiedState = verifyingStatus?.identification_verified ?? "rejected";
  const transactionVerifiedState = verifyingStatus?.transacction_verified ?? "rejected";

  // Regla UI:
  // - pending/verified => carta "apagada" y sin edición
  // - rejected (o ausencia de doc) => carta "encendida" y editable
  // Importante: si el usuario ya envió el pago pero todavía no envió documentos,
  // debe poder seguir subiéndolos. Por eso el lock del paso 1 depende SOLO del estado
  // de identificación (pending/verified), no del pago.
  const step1Locked =
    verifyingStatusLoading ||
    identificationVerifiedState === "pending" ||
    identificationVerifiedState === "verified";
  const step2Locked =
    verifyingStatusLoading ||
    transactionVerifiedState === "pending" ||
    transactionVerifiedState === "verified";

  const canContinueToPayment = isRenewalSimple || (hasImage && hasCredential);

  return (
    <div className="container max-w-xl py-8 sm:py-12 px-4">
      <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground mb-6" asChild>
        <Link href="/">
          <ArrowLeft className="h-4 w-4" />
          Volver
        </Link>
      </Button>

      <h1 className="text-2xl font-bold tracking-tight mb-2">
        {isRenewalSimple ? "Renovación simple" : "Pasos para verificarse"}
      </h1>
      <p className="text-muted-foreground text-sm mb-8">
        {isRenewalSimple
          ? `Solo necesitas subir el comprobante de tu cuota (${monthlyUsdLabel}/mes según tu categoría). No te pediremos documentos nuevamente.`
          : isCarGo
            ? "Completa la verificación para que los clientes puedan usar tus servicios de movilidad. Cuando envíes todo, los datos quedarán bloqueados hasta que el equipo revise tu solicitud."
            : "Completa ambos pasos. Cuando envíes todo, los datos quedarán bloqueados hasta que el equipo revise tu solicitud."}
      </p>

      <div className="flex flex-col gap-4">
        {!isRenewalSimple ? (
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
        ) : null}

        {!isRenewalSimple ? (
          <Card className={uploadingCredential || patchCredential.isPending ? "opacity-90" : ""}>
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="text-lg">{credentialCopy.cardTitle}</CardTitle>
                <CardDescription>{credentialCopy.description}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <input
              ref={credentialInputRef}
              type="file"
              accept="image/jpeg,image/png,application/pdf,.pdf"
              className="hidden"
              disabled={!hasImage || uploadingCredential || patchCredential.isPending}
              onChange={handleCredentialFile}
            />
            {!hasImage ? (
              <p className="text-sm text-muted-foreground mb-3">
                Este paso se habilita cuando subas tu documento de identidad (primera tarjeta). El orden completo lo ves en la sección de pago abajo.
              </p>
            ) : null}
            {hasCredential ? (
              <p className="text-sm text-muted-foreground mb-3">
                {credentialCopy.sentHint}
              </p>
            ) : hasImage ? (
              <p className="text-sm text-muted-foreground mb-3">
                Adjuntá aquí tu documento. Cuando esté listo, podrás ir al pago desde la última tarjeta.
              </p>
            ) : null}
            {hasCredential && verification?.professionalCredentialUrl ? (
              <UploadedMiniPreview
                url={verification.professionalCredentialUrl}
                mimeHint={credentialUploadMeta?.mimeType}
                fileNameHint={credentialUploadMeta?.fileName}
                label={credentialCopy.previewLabel}
              />
            ) : null}
            <Button
              type="button"
              variant="secondary"
              disabled={!hasImage || uploadingCredential || patchCredential.isPending}
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
        ) : null}

        <Card className={step2Locked ? "opacity-60 bg-muted/10" : ""}>
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="text-lg">
                  {isCarGo ? "Cuota de asociado · Servicios de movilidad" : "Cuota por ser profesional"}
                </CardTitle>
                <CardDescription>
                  {isCarGo
                    ? `Es una cuota de ${monthlyUsdLabel} por mes de visibilidad en la plataforma (según tu categoría). Con la primera validación podrás operar como asociado; cada mes debes renovar para seguir publicado. Si pagas antes de vencer el período, al validar el comprobante se suma un mes desde tu fecha de vencimiento actual.`
                    : `Es una cuota de ${monthlyUsdLabel} por mes para mantener tu servicio visible en el catálogo (según tu categoría). Con la primera validación quedas publicado; cada mes debes renovar. Si pagas antes de vencer, al validar el comprobante se suma un mes desde tu vencimiento actual (no pierdes lo ya pagado).`}
                </CardDescription>
              </div>
              {step2Locked ? <Lock className="h-5 w-5 text-muted-foreground shrink-0" /> : null}
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {!isRenewalSimple && paymentUnlockReminder ? (
              <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-3 text-sm text-amber-950 dark:text-amber-50/90">
                <p className="font-semibold leading-snug">{paymentUnlockReminder.headline}</p>
                <p className="mt-1.5 leading-relaxed text-amber-950/90 dark:text-amber-50/85">{paymentUnlockReminder.detail}</p>
                <ol className="mt-3 space-y-1.5 text-xs text-amber-950/85 dark:text-amber-50/80 [counter-reset:step]">
                  <li
                    className={`flex gap-2 [counter-increment:step] before:content-[counter(step)] before:flex before:h-5 before:w-5 before:shrink-0 before:items-center before:justify-center before:rounded-full before:text-[10px] before:font-bold ${
                      hasImage
                        ? "before:bg-emerald-600/25 before:text-emerald-900 dark:before:text-emerald-100"
                        : "before:bg-amber-600/30 before:text-amber-950 dark:before:text-amber-50"
                    }`}
                  >
                    <span className={hasImage ? "line-through opacity-75" : "font-medium"}>
                      Documento de identidad {hasImage ? "(listo)" : "(pendiente)"}
                    </span>
                  </li>
                  <li
                    className={`flex gap-2 [counter-increment:step] before:content-[counter(step)] before:flex before:h-5 before:w-5 before:shrink-0 before:items-center before:justify-center before:rounded-full before:text-[10px] before:font-bold ${
                      hasCredential
                        ? "before:bg-emerald-600/25 before:text-emerald-900 dark:before:text-emerald-100"
                        : "before:bg-amber-600/30 before:text-amber-950 dark:before:text-amber-50"
                    }`}
                  >
                    <span
                      className={
                        hasCredential ? "line-through opacity-75" : !hasImage ? "opacity-55" : "font-medium"
                      }
                    >
                      {credentialCopy.stepLabel} {hasCredential ? "(listo)" : "(pendiente)"}
                    </span>
                  </li>
                  <li
                    className={`flex gap-2 [counter-increment:step] before:content-[counter(step)] before:flex before:h-5 before:w-5 before:shrink-0 before:items-center before:justify-center before:rounded-full before:text-[10px] before:font-bold ${
                      canContinueToPayment
                        ? "before:bg-emerald-600/25 before:text-emerald-900 dark:before:text-emerald-100"
                        : "before:bg-amber-600/30 before:text-amber-950 dark:before:text-amber-50"
                    }`}
                  >
                    <span className={canContinueToPayment ? "font-medium" : "opacity-55"}>
                      Pago de la cuota {canContinueToPayment ? "(desbloqueado)" : "(se habilita al completar documentos)"}
                    </span>
                  </li>
                </ol>
              </div>
            ) : null}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button
              type="button"
              disabled={step2Locked || verifyingStatusLoading || !canContinueToPayment}
              variant="default"
              className="shrink-0 sm:ml-auto"
              onClick={() => setLocation("/professional/verify/payment")}
            >
              Continuar al pago
            </Button>
            </div>
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
