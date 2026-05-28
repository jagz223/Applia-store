import type { Server as SocketIOServer } from "socket.io";
import { getIO } from "./socket";
import { recordCentralFleetLastKnown } from "./central-fleet-last-known";
import { clearReceivingStopped, recordReceivingStopped } from "./central-fleet-receiving-stop";

export const CENTRAL_FLEET_POSITION_LIVE_MS = 45_000;

export type CentralFleetPresencePayload = {
  userId: string;
  vehicleType: string;
  isPetFriendly: boolean;
  lat: number;
  lon: number;
  updatedAt: number;
  dispatchCompanyId: string | null;
  offline?: boolean;
  /** GPS reciente (socket); false = última posición conocida, p. ej. sin señal. */
  positionLive?: boolean;
  /** Apagó «recibir servicios» de forma explícita (no pérdida de señal). */
  receivingStoppedAt?: number | null;
};

export type CentralFleetEmitOptions = {
  offline?: boolean;
  /** Conductor desactivó «recibir servicios» (conservar en mapa un tiempo con mensaje al clic). */
  receivingStopped?: boolean;
  receiving?: boolean;
  receivingTaxi?: boolean;
  receivingDelivery?: boolean;
};

export function centralFleetRoom(companyId: string): string {
  return `central:${companyId}`;
}

export function emitCentralFleetUpdate(
  io: SocketIOServer | null | undefined,
  pres: CentralFleetPresencePayload,
  options: boolean | CentralFleetEmitOptions = {},
): void {
  const sock = io ?? getIO();
  if (!sock || !pres.dispatchCompanyId) return;

  const opts: CentralFleetEmitOptions = typeof options === "boolean" ? { offline: options } : options;
  const offline = !!opts.offline;
  const receivingStopped = !!opts.receivingStopped;

  recordCentralFleetLastKnown(pres);

  let receivingStoppedAt: number | null = null;
  if (receivingStopped) {
    recordReceivingStopped(pres);
    receivingStoppedAt = Date.now();
  } else if (!offline) {
    clearReceivingStopped(pres.userId);
  }

  const positionLive =
    !offline &&
    !receivingStopped &&
    Number.isFinite(pres.updatedAt) &&
    Date.now() - pres.updatedAt <= CENTRAL_FLEET_POSITION_LIVE_MS;

  sock.to(centralFleetRoom(pres.dispatchCompanyId)).emit("central:fleet:update", {
    ...pres,
    offline,
    positionLive,
    receivingStoppedAt,
    ...(opts.receiving !== undefined ? { receiving: opts.receiving } : {}),
    ...(opts.receivingTaxi !== undefined ? { receivingTaxi: opts.receivingTaxi } : {}),
    ...(opts.receivingDelivery !== undefined ? { receivingDelivery: opts.receivingDelivery } : {}),
  });
}
