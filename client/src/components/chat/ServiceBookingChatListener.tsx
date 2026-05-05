import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSocket } from "@/hooks/use-socket";
import { useToast } from "@/hooks/use-toast";

/**
 * Escucha eventos de chat automático al iniciar / finalizar servicios (reservas marketplace).
 * No cambia de vista: solo refresca la lista de conversaciones y muestra avisos breves.
 */
export function ServiceBookingChatListener() {
  const { socket } = useSocket();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    if (!socket) return;

    const onReady = () => {
      void queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] });
      void queryClient.refetchQueries({ queryKey: ["chat", "conversations"] });
    };

    const onClosing = (payload: { serviceChatHideFromUsersAt?: string }) => {
      void queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] });
      void queryClient.refetchQueries({ queryKey: ["chat", "conversations"] });
      let cierre = "";
      if (payload?.serviceChatHideFromUsersAt) {
        const until = new Date(payload.serviceChatHideFromUsersAt);
        if (!Number.isNaN(until.getTime())) {
          cierre = ` Quedará en tu bandeja hasta aprox. ${until.toLocaleString("es-EC", { dateStyle: "medium", timeStyle: "short" })}.`;
        }
      }
      toast({
        title: "Servicio finalizado",
        description: `Podés seguir escribiendo un rato para coordinar cierres o guardar comprobantes; luego el chat dejará de mostrarse en tu lista (el registro se conserva para el equipo de soporte).${cierre}`,
        duration: 12_000,
      });
    };

    socket.on("service:booking:chat_ready", onReady);
    socket.on("service:booking:chat_closing", onClosing);
    return () => {
      socket.off("service:booking:chat_ready", onReady);
      socket.off("service:booking:chat_closing", onClosing);
    };
  }, [socket, queryClient, toast]);

  return null;
}
