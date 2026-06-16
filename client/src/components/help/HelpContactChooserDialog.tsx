import { MessageCircle, Phone } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SUPPORT_WHATSAPP_DISPLAY, SUPPORT_WHATSAPP_URL } from "@shared/support-contact";
import { useOpenSupportHelpChat } from "@/hooks/use-support-chat";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

export function HelpContactChooserDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const openSupportChat = useOpenSupportHelpChat();
  const [loading, setLoading] = useState(false);

  async function handlePageChat() {
    setLoading(true);
    try {
      onOpenChange(false);
      await openSupportChat();
    } catch (e) {
      toast({
        variant: "destructive",
        title: "No se pudo abrir el chat",
        description: e instanceof Error ? e.message : "Error desconocido",
      });
    } finally {
      setLoading(false);
    }
  }

  function handleWhatsApp() {
    onOpenChange(false);
    window.open(SUPPORT_WHATSAPP_URL, "_blank", "noopener,noreferrer");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Centro de ayuda</DialogTitle>
          <DialogDescription>¿Cómo prefieres contactarnos?</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 pt-2">
          <Button
            type="button"
            className="justify-start gap-2 h-auto py-3"
            disabled={loading}
            onClick={() => void handlePageChat()}
          >
            <MessageCircle className="h-5 w-5 shrink-0" />
            <span className="text-left">
              <span className="block font-medium">Chat en la página</span>
              <span className="block text-xs font-normal text-primary-foreground/80">
                Habla con un asesor de GenFeb
              </span>
            </span>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="justify-start gap-2 h-auto py-3"
            onClick={handleWhatsApp}
          >
            <Phone className="h-5 w-5 shrink-0" />
            <span className="text-left">
              <span className="block font-medium">WhatsApp</span>
              <span className="block text-xs font-normal text-muted-foreground">{SUPPORT_WHATSAPP_DISPLAY}</span>
            </span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
