import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import type { CargoRideOfferPayload } from "@/components/taxi/CargoIncomingRideDialog";

type GoDriverUiState = {
  /** Registra el callback que abre el historial (solo vista conductor). */
  registerOpenHistory: (fn: (() => void) | null) => void;
  openHistory: () => void;
  /** Oferta activa (modal). */
  currentOffer: { module: "cargo" | "pack"; offer: CargoRideOfferPayload } | null;
  /** Cola FIFO de ofertas (evita sobrecargar la pantalla). */
  offerQueue: Array<{ module: "cargo" | "pack"; offer: CargoRideOfferPayload }>;
  /** Entra una oferta: si ya hay una visible, se encola; si no, se muestra. */
  pushOffer: (module: "cargo" | "pack", offer: CargoRideOfferPayload) => void;
  /** Cierra la oferta actual (si coincide rideId) y muestra la siguiente en cola. */
  resolveOfferAndShowNext: (rideId: string) => void;
};

const Ctx = createContext<GoDriverUiState | null>(null);

export function GoDriverUiProvider({ children }: { children: ReactNode }) {
  const openHistoryRef = useRef<(() => void) | null>(null);
  const [currentOffer, setCurrentOffer] = useState<GoDriverUiState["currentOffer"]>(null);
  const [offerQueue, setOfferQueue] = useState<GoDriverUiState["offerQueue"]>([]);

  const registerOpenHistory = useCallback((fn: (() => void) | null) => {
    openHistoryRef.current = fn;
  }, []);

  const openHistory = useCallback(() => {
    openHistoryRef.current?.();
  }, []);

  const pushOffer = useCallback((module: "cargo" | "pack", offer: CargoRideOfferPayload) => {
    setCurrentOffer((cur) => {
      if (!cur) return { module, offer };
      setOfferQueue((q) => [...q, { module, offer }]);
      return cur;
    });
  }, []);

  const resolveOfferAndShowNext = useCallback((rideId: string) => {
    setCurrentOffer((cur) => {
      if (!cur) return null;
      if (cur.offer?.rideId !== rideId) return cur;
      return null;
    });
    setOfferQueue((q) => {
      if (q.length === 0) return q;
      const [next, ...rest] = q;
      // Mostrar la siguiente oferta.
      setCurrentOffer(next);
      return rest;
    });
  }, []);

  const value = useMemo(
    () => ({ registerOpenHistory, openHistory, currentOffer, offerQueue, pushOffer, resolveOfferAndShowNext }),
    [registerOpenHistory, openHistory, currentOffer, offerQueue, pushOffer, resolveOfferAndShowNext]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGoDriverUi(): GoDriverUiState | null {
  return useContext(Ctx);
}
