import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, Loader2, Upload } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { uploadProfileImage } from "@/lib/firebase-client";
import {
  avatarCooldownRemainingMs,
  formatAvatarCooldownRemaining,
  isExternalAvatarUrl,
  isHostedStorageAvatarUrl,
} from "@shared/avatar-profile";
import { PhotoCapture } from "@/components/PhotoCapture";
import { cn } from "@/lib/utils";

type SettingsAvatarEditorProps = {
  name: string;
  lastName: string;
  avatarUrl: string | null | undefined;
  avatarLastChangedAt?: string | null;
  className?: string;
};

export function SettingsAvatarEditor({
  name,
  lastName,
  avatarUrl,
  avatarLastChangedAt,
  className,
}: SettingsAvatarEditorProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [savingExternal, setSavingExternal] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [externalDraft, setExternalDraft] = useState(() =>
    isExternalAvatarUrl(avatarUrl) ? String(avatarUrl).trim() : "",
  );

  const displayUrl = String(avatarUrl ?? "").trim() || null;
  const cooldownMs = avatarCooldownRemainingMs(avatarLastChangedAt);
  const canChange = cooldownMs <= 0;
  const initials = `${name?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase() || "?";

  const applyAvatar = async (url: string) => {
    const token = localStorage.getItem("token");
    const res = await fetch("/api/auth/avatar", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ avatarUrl: url }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || "No se pudo actualizar la foto");
    if (data.user) queryClient.setQueryData(["user"], data.user);
    if (isExternalAvatarUrl(url)) setExternalDraft(url);
    else setExternalDraft("");
    toast({ title: "Foto actualizada", description: "Tu foto de perfil se guardó correctamente." });
  };

  const handleFile = async (file: File) => {
    if (!canChange) {
      toast({
        variant: "destructive",
        title: "Espera un poco",
        description: `Solo puedes cambiar la foto cada 24 horas. Vuelve en ${formatAvatarCooldownRemaining(cooldownMs)}.`,
      });
      return;
    }
    setUploading(true);
    try {
      const url = await uploadProfileImage(file);
      await applyAvatar(url);
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Error",
        description: e instanceof Error ? e.message : "No se pudo subir la imagen.",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleExternalSave = async () => {
    const url = externalDraft.trim();
    if (!url) return;
    if (!canChange) {
      toast({
        variant: "destructive",
        title: "Espera un poco",
        description: `Solo puedes cambiar la foto cada 24 horas. Vuelve en ${formatAvatarCooldownRemaining(cooldownMs)}.`,
      });
      return;
    }
    if (isHostedStorageAvatarUrl(url)) {
      toast({
        variant: "destructive",
        title: "Enlace no permitido",
        description: "Usa «Subir imagen» para fotos en la plataforma. Aquí solo enlaces externos.",
      });
      return;
    }
    setSavingExternal(true);
    try {
      await applyAvatar(url);
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Error",
        description: e instanceof Error ? e.message : "No se pudo guardar el enlace.",
      });
    } finally {
      setSavingExternal(false);
    }
  };

  return (
    <div className={cn("space-y-4 rounded-lg border border-border/60 bg-muted/10 p-4", className)}>
      <div>
        <Label className="text-base">Foto de perfil</Label>
        <p className="text-xs text-muted-foreground mt-1">
          Tu foto actual se muestra aquí. Puedes cambiarla subiendo una imagen (máximo una vez cada 24 horas).
        </p>
        {!canChange ? (
          <p className="text-xs text-amber-700 dark:text-amber-400 mt-2 font-medium">
            Podrás volver a cambiar la foto en {formatAvatarCooldownRemaining(cooldownMs)}.
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Avatar className="h-20 w-20 ring-2 ring-primary/20">
          {displayUrl ? <AvatarImage src={displayUrl} alt="" className="object-cover" /> : null}
          <AvatarFallback className="text-lg font-semibold">{initials}</AvatarFallback>
        </Avatar>
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canChange || uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Subir imagen
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canChange || uploading}
            onClick={() => setIsCameraOpen(true)}
          >
            <Camera className="mr-2 h-4 w-4" />
            Cámara
          </Button>
        </div>
      </div>

      <div className="space-y-2 border-t border-border/50 pt-3">
        <Label className="text-sm">Enlace de imagen externa (opcional)</Label>
        <p className="text-xs text-muted-foreground">
          Solo para fotos alojadas fuera de GenFeb (no uses enlaces de Firebase ni de la base de datos).
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            placeholder="https://ejemplo.com/tu-foto.jpg"
            value={externalDraft}
            onChange={(e) => setExternalDraft(e.target.value)}
            disabled={!canChange || savingExternal}
          />
          <Button
            type="button"
            variant="secondary"
            className="shrink-0"
            disabled={!canChange || savingExternal || !externalDraft.trim()}
            onClick={() => void handleExternalSave()}
          >
            {savingExternal ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Usar enlace
          </Button>
        </div>
      </div>

      <PhotoCapture
        isOpen={isCameraOpen}
        onOpenChange={setIsCameraOpen}
        onCapture={(file) => void handleFile(file)}
      />
    </div>
  );
}
