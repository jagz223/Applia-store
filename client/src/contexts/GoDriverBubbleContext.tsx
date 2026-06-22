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
import { useLocation } from "wouter";
import type { GoDriverReceiveMode } from "@/lib/cargo-driver-storage";
import {
  closeDriverBubblePiP,
  isAppHiddenForBubble,
  isDriverBubbleActive,
  isDriverBubbleMainPath,
  isDriverBubbleModeSupported,
  isDriverDocumentPiPSupported,
  openDriverBubblePiP,
  readDriverBubblePinnedInSettings,
  updateDriverBubblePiPContent,
  writeDriverBubblePinnedInSettings,
} from "@/lib/go-driver-bubble-mode";

type GoDriverBubbleValue = {
  supported: boolean;
  pipSupported: boolean;
  active: boolean;
  enabled: boolean;
  pinnedInSettings: boolean;
  setPinnedInSettings: (next: boolean) => void;
  isMinimized: boolean;
  pipActive: boolean;
  receiveMode: GoDriverReceiveMode;
  receiving: boolean;
  setReceiveMode: (mode: GoDriverReceiveMode, canReceive: boolean) => void;
  minimize: () => Promise<void>;
  expand: () => void;
  toggleMinimized: () => Promise<void>;
};

const GoDriverBubbleContext = createContext<GoDriverBubbleValue | null>(null);

export function GoDriverBubbleProvider({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const supported = isDriverBubbleModeSupported();
  const pipSupported = isDriverDocumentPiPSupported();
  const [pinnedInSettings, setPinnedInSettingsState] = useState(() => readDriverBubblePinnedInSettings());
  const [receiveMode, setReceiveModeState] = useState<GoDriverReceiveMode>("off");
  const [receiving, setReceivingState] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [pipActive, setPipActive] = useState(false);
  const pipWindowRef = useRef<Window | null>(null);
  const minimizingRef = useRef(false);
  const isMinimizedRef = useRef(isMinimized);
  const receivingRef = useRef(receiving);
  const receiveModeRef = useRef(receiveMode);
  const pinnedInSettingsRef = useRef(pinnedInSettings);
  const locationRef = useRef(location);

  const active = isDriverBubbleActive(receiving, pinnedInSettings);
  const activeRef = useRef(active);

  isMinimizedRef.current = isMinimized;
  receivingRef.current = receiving;
  receiveModeRef.current = receiveMode;
  pinnedInSettingsRef.current = pinnedInSettings;
  locationRef.current = location;
  activeRef.current = active;

  const collapseBubble = useCallback(() => {
    setIsMinimized(false);
    setPipActive(false);
    closeDriverBubblePiP();
    pipWindowRef.current = null;
  }, []);

  const setPinnedInSettings = useCallback(
    (next: boolean) => {
      setPinnedInSettingsState(next);
      writeDriverBubblePinnedInSettings(next);
      if (!next && !receivingRef.current) {
        collapseBubble();
      }
    },
    [collapseBubble],
  );

  const setReceiveMode = useCallback(
    (mode: GoDriverReceiveMode, canReceive: boolean) => {
      const receivingNow = mode !== "off" && canReceive;
      setReceiveModeState(mode);
      setReceivingState(receivingNow);
      if (!receivingNow && !pinnedInSettingsRef.current) {
        collapseBubble();
      }
    },
    [collapseBubble],
  );

  const expand = useCallback(() => {
    collapseBubble();
    try {
      window.focus();
    } catch {
      /* ignore */
    }
  }, [collapseBubble]);

  const openPiPIfNeeded = useCallback(async () => {
    if (!pipSupported || pipWindowRef.current || !isMinimizedRef.current) return;
    const pip = await openDriverBubblePiP({
      receiveMode: receiveModeRef.current,
      receiving: receivingRef.current,
      onActivate: () => {
        setPipActive(false);
        pipWindowRef.current = null;
        setIsMinimized(false);
        try {
          window.focus();
        } catch {
          /* ignore */
        }
      },
    });
    if (!pip || !isMinimizedRef.current) {
      if (pip) {
        try {
          pip.close();
        } catch {
          /* ignore */
        }
      }
      return;
    }
    pipWindowRef.current = pip;
    setPipActive(true);
  }, [pipSupported]);

  const minimize = useCallback(async () => {
    if (!activeRef.current || !supported) return;
    if (!isDriverBubbleMainPath(locationRef.current)) return;
    if (minimizingRef.current || isMinimizedRef.current) return;
    minimizingRef.current = true;
    try {
      setIsMinimized(true);
      await openPiPIfNeeded();
    } finally {
      minimizingRef.current = false;
    }
  }, [supported, openPiPIfNeeded]);

  const toggleMinimized = useCallback(async () => {
    if (isMinimizedRef.current) {
      expand();
      return;
    }
    await minimize();
  }, [expand, minimize]);

  const shouldAutoMinimize = useCallback(() => {
    if (!activeRef.current || !supported) return false;
    if (!isDriverBubbleMainPath(locationRef.current)) return false;
    if (isMinimizedRef.current) return false;
    return isAppHiddenForBubble();
  }, [supported]);

  useEffect(() => {
    if (!active || !supported) return;

    const onHide = () => {
      if (!shouldAutoMinimize()) return;
      void minimize();
    };

    const onShow = () => {
      if (document.visibilityState !== "visible") return;
      if (!isMinimizedRef.current) return;
      expand();
    };

    const onVisibilityChange = () => {
      if (isAppHiddenForBubble()) onHide();
      else onShow();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onHide);
    window.addEventListener("pageshow", onShow);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("pageshow", onShow);
    };
  }, [active, supported, minimize, expand, shouldAutoMinimize]);

  useEffect(() => {
    if (isDriverBubbleMainPath(location)) return;
    if (isMinimizedRef.current) {
      collapseBubble();
    }
  }, [location, collapseBubble]);

  useEffect(() => {
    updateDriverBubblePiPContent(pipWindowRef.current, receiveMode, receiving);
  }, [receiveMode, receiving]);

  useEffect(() => {
    return () => {
      closeDriverBubblePiP();
      pipWindowRef.current = null;
    };
  }, []);

  const value = useMemo(
    () => ({
      supported,
      pipSupported,
      active,
      enabled: active,
      pinnedInSettings,
      setPinnedInSettings,
      isMinimized,
      pipActive,
      receiveMode,
      receiving,
      setReceiveMode,
      minimize,
      expand,
      toggleMinimized,
    }),
    [
      supported,
      pipSupported,
      active,
      pinnedInSettings,
      setPinnedInSettings,
      isMinimized,
      pipActive,
      receiveMode,
      receiving,
      minimize,
      expand,
      toggleMinimized,
    ],
  );

  return <GoDriverBubbleContext.Provider value={value}>{children}</GoDriverBubbleContext.Provider>;
}

export function useGoDriverBubble(): GoDriverBubbleValue {
  const ctx = useContext(GoDriverBubbleContext);
  if (!ctx) {
    throw new Error("useGoDriverBubble debe usarse dentro de GoDriverBubbleProvider");
  }
  return ctx;
}

export function useGoDriverBubbleOptional(): GoDriverBubbleValue | null {
  return useContext(GoDriverBubbleContext);
}
