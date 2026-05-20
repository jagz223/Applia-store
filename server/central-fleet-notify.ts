import type { Server as SocketIOServer } from "socket.io";
import { getIO } from "./socket";

export type CentralFleetPresencePayload = {
  userId: string;
  vehicleType: string;
  isPetFriendly: boolean;
  lat: number;
  lon: number;
  updatedAt: number;
  dispatchCompanyId: string | null;
  offline?: boolean;
};

export function centralFleetRoom(companyId: string): string {
  return `central:${companyId}`;
}

export function emitCentralFleetUpdate(
  io: SocketIOServer | null | undefined,
  pres: CentralFleetPresencePayload,
  offline = false,
): void {
  const sock = io ?? getIO();
  if (!sock || !pres.dispatchCompanyId) return;
  sock.to(centralFleetRoom(pres.dispatchCompanyId)).emit("central:fleet:update", {
    ...pres,
    offline,
  });
}
