import { useEffect, useRef, type MutableRefObject } from "react";
import type { Socket } from "socket.io-client";
import { haversineM } from "@shared/maps-route-math";

/** Emisión frecuente pero sin saturar el socket. */
export const RIDE_LOCATION_MIN_INTERVAL_MS = 800;
export const RIDE_LOCATION_MIN_MOVE_M = 5;
export const RIDE_LOCATION_POLL_MS = 500;

export function useEmitRideLocation(options: {
  socket: Socket | null;
  rideId: string | null;
  geoPos: { lat: number; lon: number } | null;
  geoPosRef: MutableRefObject<{ lat: number; lon: number } | null>;
  eventName: string;
}): void {
  const lastEmitRef = useRef<{ at: number; lat: number; lon: number } | null>(null);

  useEffect(() => {
    if (!options.socket || !options.rideId) return;

    const emitNow = () => {
      const p = options.geoPosRef.current;
      if (!p) return;
      const now = Date.now();
      const prev = lastEmitRef.current;
      if (prev) {
        const elapsed = now - prev.at;
        const moved = haversineM(prev, p);
        if (elapsed < RIDE_LOCATION_MIN_INTERVAL_MS && moved < RIDE_LOCATION_MIN_MOVE_M) return;
      }
      lastEmitRef.current = { at: now, lat: p.lat, lon: p.lon };
      options.socket!.emit(options.eventName, {
        rideId: options.rideId,
        lat: p.lat,
        lon: p.lon,
      });
    };

    emitNow();
    const id = window.setInterval(emitNow, RIDE_LOCATION_POLL_MS);
    return () => window.clearInterval(id);
  }, [
    options.socket,
    options.rideId,
    options.eventName,
    options.geoPos?.lat,
    options.geoPos?.lon,
    options.geoPosRef,
  ]);
}
