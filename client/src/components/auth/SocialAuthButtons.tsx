import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth, type AuthUser } from "@/hooks/use-auth";
import {
  signInWithSocialProvider,
  type SocialAuthProviderId,
} from "@/lib/social-auth";
import { cn } from "@/lib/utils";

type SocialAuthButtonsProps = {
  className?: string;
  onSuccess?: (result: { token: string; user: AuthUser }) => void;
};

export function SocialAuthButtons({ className, onSuccess }: SocialAuthButtonsProps) {
  const { toast } = useToast();
  const { setUser } = useAuth();
  const [busy, setBusy] = useState<SocialAuthProviderId | null>(null);

  const handleSocial = async (kind: SocialAuthProviderId) => {
    if (busy) return;
    setBusy(kind);
    try {
      const result = await signInWithSocialProvider(kind);
      localStorage.setItem("token", result.token);
      setUser(result.user);
      onSuccess?.(result);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "No se pudo continuar",
        description: error instanceof Error ? error.message : "Error de autenticación social",
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={cn("grid gap-2", className)}>
      <Button
        type="button"
        variant="outline"
        className="h-11 rounded-full"
        disabled={busy != null}
        onClick={() => void handleSocial("google")}
      >
        {busy === "google" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Continuar con Google
      </Button>
      <Button
        type="button"
        variant="outline"
        className="h-11 rounded-full"
        disabled={busy != null}
        onClick={() => void handleSocial("facebook")}
      >
        {busy === "facebook" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Continuar con Facebook
      </Button>
    </div>
  );
}
