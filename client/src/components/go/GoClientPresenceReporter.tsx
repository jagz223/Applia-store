import { useEffect } from "react";
import { useSocket } from "@/hooks/use-socket";

function readPageHidden(): boolean {
  if (typeof document === "undefined") return false;
  return document.hidden;
}

/** Informa al servidor la ruta Go y si la pestaña/app está en segundo plano (para push de ofertas). */
export function GoClientPresenceReporter({ path }: { path: string }) {
  const { socket } = useSocket();

  useEffect(() => {
    if (!socket) return;

    const emit = () => {
      socket.emit("go:presence", { path, hidden: readPageHidden() });
    };

    emit();

    const onVisibility = () => emit();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onVisibility);
    window.addEventListener("pageshow", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onVisibility);
      window.removeEventListener("pageshow", onVisibility);
    };
  }, [socket, path]);

  return null;
}
