import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  clearAllGoReceiving,
  loadGoDriverReceiveMode,
  saveGoDriverReceiveMode,
  type GoDriverReceiveMode,
} from "@/lib/cargo-driver-storage";
import { emitDriverWorkModeTelemetry } from "@/lib/driver-work-mode-telemetry";
import { useSocket } from "@/hooks/use-socket";

type GoDriverSessionValue = {
  geoPos: { lat: number; lon: number } | null;
  geoPosRef: React.MutableRefObject<{ lat: number; lon: number } | null>;
  receiveMode: GoDriverReceiveMode;
  setReceiveMode: (mode: GoDriverReceiveMode) => void;
  stopReceiving: () => void;
};

const GoDriverSessionContext = createContext<GoDriverSessionValue | null>(null);

export function GoDriverSessionProvider({ children }: { children: ReactNode }) {
  const { socket } = useSocket();
  const [geoPos, setGeoPos] = useState<{ lat: number; lon: number } | null>(null);
  const [receiveMode, setReceiveModeState] = useState<GoDriverReceiveMode>(() => loadGoDriverReceiveMode());
  const geoPosRef = useRef(geoPos);
  geoPosRef.current = geoPos;

  const setReceiveMode = useCallback(
    (mode: GoDriverReceiveMode) => {
      setReceiveModeState(mode);
      saveGoDriverReceiveMode(mode);
      emitDriverWorkModeTelemetry(socket, mode);
    },
    [socket],
  );

  useEffect(() => {
    emitDriverWorkModeTelemetry(socket, receiveMode);
  }, [socket, receiveMode]);

  const stopReceiving = useCallback(() => {
    setReceiveModeState("off");
    clearAllGoReceiving();
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) return;
    let cancelled = false;
    const apply = (p: GeolocationPosition) => {
      if (cancelled) return;
      setGeoPos({ lat: p.coords.latitude, lon: p.coords.longitude });
    };
    navigator.geolocation.getCurrentPosition(
      apply,
      () => {},
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 25_000 },
    );
    const id = navigator.geolocation.watchPosition(
      apply,
      () => {},
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 60_000 },
    );
    return () => {
      cancelled = true;
      navigator.geolocation.clearWatch(id);
    };
  }, []);

  const value = useMemo(
    () => ({
      geoPos,
      geoPosRef,
      receiveMode,
      setReceiveMode,
      stopReceiving,
    }),
    [geoPos, receiveMode, setReceiveMode, stopReceiving],
  );

  return <GoDriverSessionContext.Provider value={value}>{children}</GoDriverSessionContext.Provider>;
}

export function useGoDriverSession(): GoDriverSessionValue {
  const ctx = useContext(GoDriverSessionContext);
  if (!ctx) {
    throw new Error("useGoDriverSession debe usarse dentro de GoDriverSessionProvider");
  }
  return ctx;
}

/** Solo en `/go/driver` y subrutas; fuera del provider devuelve null. */
export function useGoDriverSessionOptional(): GoDriverSessionValue | null {
  return useContext(GoDriverSessionContext);
}
