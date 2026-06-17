import { createContext, useCallback, useContext, useMemo, useReducer, useRef, type ReactNode } from "react";
import type { CargoRideOfferPayload } from "@/components/taxi/CargoIncomingRideDialog";

export type GoDriverQueuedOffer = { module: "cargo" | "pack"; offer: CargoRideOfferPayload };

type ModalState = {
  currentOffer: GoDriverQueuedOffer | null;
  offerQueue: GoDriverQueuedOffer[];
};

type ModalAction =
  | { type: "PUSH_OFFER"; module: "cargo" | "pack"; offer: CargoRideOfferPayload }
  | { type: "RESOLVE_CURRENT"; rideId: string }
  | { type: "DISMISS_OFFER"; rideId: string }
  | { type: "CLEAR_ALL" };

function offerModalReducer(state: ModalState, action: ModalAction): ModalState {
  switch (action.type) {
    case "CLEAR_ALL":
      return { currentOffer: null, offerQueue: [] };
    case "PUSH_OFFER": {
      const entry: GoDriverQueuedOffer = { module: action.module, offer: action.offer };
      const rideId = entry.offer.rideId;
      if (state.currentOffer?.offer.rideId === rideId) return state;
      if (state.offerQueue.some((e) => e.offer.rideId === rideId)) return state;
      if (!state.currentOffer) return { ...state, currentOffer: entry };
      return { ...state, offerQueue: [...state.offerQueue, entry] };
    }
    case "DISMISS_OFFER": {
      const rideId = action.rideId;
      const queue = state.offerQueue.filter((e) => e.offer.rideId !== rideId);
      const cur = state.currentOffer;
      if (cur?.offer.rideId === rideId) {
        const [next, ...rest] = queue;
        return { currentOffer: next ?? null, offerQueue: rest };
      }
      return { ...state, offerQueue: queue };
    }
    case "RESOLVE_CURRENT": {
      const cur = state.currentOffer;
      if (!cur || cur.offer.rideId !== action.rideId) return state;
      const [next, ...rest] = state.offerQueue;
      return { currentOffer: next ?? null, offerQueue: rest };
    }
    default:
      return state;
  }
}

type GoDriverUiState = {
  /** Registra el callback que abre el historial (solo vista conductor). */
  registerOpenHistory: (fn: (() => void) | null) => void;
  openHistory: () => void;
  /** Tablero de regateo (sheet), independiente de “recibir pedidos”. */
  registerOpenNegotiationBoard: (fn: (() => void) | null) => void;
  openNegotiationBoard: () => void;
  /** Oferta activa (modal). */
  currentOffer: GoDriverQueuedOffer | null;
  /** Cola FIFO de ofertas (evita sobrecargar la pantalla). */
  offerQueue: GoDriverQueuedOffer[];
  /** Entra una oferta: si ya hay una visible, se encola; si no, se muestra. */
  pushOffer: (module: "cargo" | "pack", offer: CargoRideOfferPayload) => void;
  /** Cierra/descarta una oferta (actual o en cola) por rideId. */
  dismissOffer: (rideId: string) => void;
  /** Cierra la oferta actual (si coincide rideId) y muestra la siguiente en cola. */
  resolveOfferAndShowNext: (rideId: string) => void;
  /** Limpia modal + cola de ofertas (ej. al aceptar un servicio). */
  clearOffers: () => void;
};

const Ctx = createContext<GoDriverUiState | null>(null);

export function GoDriverUiProvider({ children }: { children: ReactNode }) {
  const openHistoryRef = useRef<(() => void) | null>(null);
  const openNegotiationBoardRef = useRef<(() => void) | null>(null);
  const [{ currentOffer, offerQueue }, dispatch] = useReducer(offerModalReducer, {
    currentOffer: null,
    offerQueue: [],
  });

  const registerOpenHistory = useCallback((fn: (() => void) | null) => {
    openHistoryRef.current = fn;
  }, []);

  const openHistory = useCallback(() => {
    openHistoryRef.current?.();
  }, []);

  const registerOpenNegotiationBoard = useCallback((fn: (() => void) | null) => {
    openNegotiationBoardRef.current = fn;
  }, []);

  const openNegotiationBoard = useCallback(() => {
    openNegotiationBoardRef.current?.();
  }, []);

  const pushOffer = useCallback((module: "cargo" | "pack", offer: CargoRideOfferPayload) => {
    dispatch({ type: "PUSH_OFFER", module, offer });
  }, []);

  const dismissOffer = useCallback((rideId: string) => {
    dispatch({ type: "DISMISS_OFFER", rideId });
  }, []);

  const resolveOfferAndShowNext = useCallback((rideId: string) => {
    dispatch({ type: "RESOLVE_CURRENT", rideId });
  }, []);

  const clearOffers = useCallback(() => {
    dispatch({ type: "CLEAR_ALL" });
  }, []);

  const value = useMemo(
    () => ({
      registerOpenHistory,
      openHistory,
      registerOpenNegotiationBoard,
      openNegotiationBoard,
      currentOffer,
      offerQueue,
      pushOffer,
      dismissOffer,
      resolveOfferAndShowNext,
      clearOffers,
    }),
    [
      registerOpenHistory,
      openHistory,
      registerOpenNegotiationBoard,
      openNegotiationBoard,
      currentOffer,
      offerQueue,
      pushOffer,
      dismissOffer,
      resolveOfferAndShowNext,
      clearOffers,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGoDriverUi(): GoDriverUiState | null {
  return useContext(Ctx);
}
