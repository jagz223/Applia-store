import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from "react";

type GoDriverUiState = {
  /** Registra el callback que abre el historial (solo vista conductor). */
  registerOpenHistory: (fn: (() => void) | null) => void;
  openHistory: () => void;
};

const Ctx = createContext<GoDriverUiState | null>(null);

export function GoDriverUiProvider({ children }: { children: ReactNode }) {
  const openHistoryRef = useRef<(() => void) | null>(null);

  const registerOpenHistory = useCallback((fn: (() => void) | null) => {
    openHistoryRef.current = fn;
  }, []);

  const openHistory = useCallback(() => {
    openHistoryRef.current?.();
  }, []);

  const value = useMemo(
    () => ({ registerOpenHistory, openHistory }),
    [registerOpenHistory, openHistory]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGoDriverUi(): GoDriverUiState | null {
  return useContext(Ctx);
}
