/**
 * Retira ofertas de regateo pendientes de un conductor en el otro módulo (taxi ↔ delivery)
 * sin crear dependencia circular entre mobility-rides y pack-rides.
 */
import type { Server as SocketIOServer } from "socket.io";

type WithdrawFn = (io: SocketIOServer, driverUserId: string, keepRideId: string) => void;

let mobilityWithdraw: WithdrawFn | null = null;
let packWithdraw: WithdrawFn | null = null;

export function registerMobilityNegotiationWithdraw(fn: WithdrawFn) {
  mobilityWithdraw = fn;
}

export function registerPackNegotiationWithdraw(fn: WithdrawFn) {
  packWithdraw = fn;
}

export function withdrawDriverNegotiationOffersEverywhere(io: SocketIOServer, driverUserId: string, keepRideId: string) {
  mobilityWithdraw?.(io, driverUserId, keepRideId);
  packWithdraw?.(io, driverUserId, keepRideId);
}
