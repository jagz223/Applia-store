import type { Socket } from "socket.io-client";
import type { GoDriverReceiveMode } from "@/lib/cargo-driver-storage";

export function emitDriverWorkModeTelemetry(
  socket: Socket | null | undefined,
  mode: GoDriverReceiveMode,
): void {
  if (!socket?.connected) return;
  socket.emit("driver:work_mode", { mode, at: Date.now() });
}
