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
import {
  readLastKnownDriverGeo,
  requestDriverGeolocationNow,
  startDriverGeolocationWatch,
  type DriverGeolocationError,
  type DriverGeoPoint,
} from "@/lib/driver-geolocation";
import { bootstrapAppGeolocationPermission } from "@/lib/map-geolocation";
import { isLeafletMobileMap } from "@/components/taxi/leaflet-config";
import { useSocket } from "@/hooks/use-socket";

type GoDriverSessionValue = {
  geoPos: DriverGeoPoint | null;
  geoPosRef: React.MutableRefObject<DriverGeoPoint | null>;
  geoLocating: boolean;
  geoError: DriverGeolocationError | null;
  requestLocation: () => void;
  receiveMode: GoDriverReceiveMode;
  setReceiveMode: (mode: GoDriverReceiveMode) => void;
  stopReceiving: () => void;
};

const GoDriverSessionContext = createContext<GoDriverSessionValue | null>(null);

export function GoDriverSessionProvider({ children }: { children: ReactNode }) {
  const { socket } = useSocket();
  const [geoPos, setGeoPos] = useState<DriverGeoPoint | null>(() => readLastKnownDriverGeo());
  const [geoLocating, setGeoLocating] = useState(() => !readLastKnownDriverGeo());
  const [geoError, setGeoError] = useState<DriverGeolocationError | null>(null);
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

  const applyPosition = useCallback((p: DriverGeoPoint) => {
    setGeoPos(p);
    setGeoError(null);
  }, []);

  const requestLocation = useCallback(() => {
    requestDriverGeolocationNow(applyPosition, setGeoError, setGeoLocating);
  }, [applyPosition]);

  useEffect(() => {
    void bootstrapAppGeolocationPermission();
    const stop = startDriverGeolocationWatch({
      onPosition: applyPosition,
      onError: setGeoError,
      onLocatingChange: setGeoLocating,
      requestPermissionOnMount: isLeafletMobileMap(),
    });
    return stop;
  }, [applyPosition]);

  /** Móvil: reaccionar si el usuario cambia el permiso en ajustes del sistema. */
  useEffect(() => {
    if (!isLeafletMobileMap()) return;
    if (typeof navigator.permissions?.query !== "function") return;

    let cancelled = false;
    let status: PermissionStatus | null = null;

    void navigator.permissions
      .query({ name: "geolocation" })
      .then((s) => {
        if (cancelled) return;
        status = s;
        status.onchange = () => {
          if (status?.state === "granted") {
            setGeoError(null);
            requestLocation();
          } else if (status?.state === "denied") {
            setGeoError("denied");
            setGeoLocating(false);
          }
        };
      })
      .catch(() => {
        /* Safari/iOS: sin Permissions API; el watch ya gestiona prompt/granted */
      });

    return () => {
      cancelled = true;
      if (status) status.onchange = null;
    };
  }, [requestLocation]);

  /** Al volver de ajustes del sistema, reintentar GPS si el permiso fue concedido. */
  useEffect(() => {
    if (!isLeafletMobileMap()) return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void bootstrapAppGeolocationPermission().then((state) => {
        if (state === "granted") {
          requestLocation();
        }
      });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [requestLocation]);

  const value = useMemo(
    () => ({
      geoPos,
      geoPosRef,
      geoLocating,
      geoError,
      requestLocation,
      receiveMode,
      setReceiveMode,
      stopReceiving,
    }),
    [geoPos, geoLocating, geoError, requestLocation, receiveMode, setReceiveMode, stopReceiving],
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
