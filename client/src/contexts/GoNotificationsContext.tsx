import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useSocket } from "@/hooks/use-socket";

type GoNotificationsState = {
  isOpen: boolean;
  openNotifications: () => void;
  closeNotifications: () => void;
};

const Ctx = createContext<GoNotificationsState | null>(null);

export function GoNotificationsProvider({ children }: { children: React.ReactNode }) {
  const { clearNotifications } = useSocket();
  const [isOpen, setIsOpen] = useState(false);

  const openNotifications = useCallback(() => {
    setIsOpen(true);
    clearNotifications();
  }, [clearNotifications]);

  const closeNotifications = useCallback(() => setIsOpen(false), []);

  const value = useMemo<GoNotificationsState>(
    () => ({ isOpen, openNotifications, closeNotifications }),
    [isOpen, openNotifications, closeNotifications]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGoNotifications(): GoNotificationsState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useGoNotifications debe usarse dentro de GoNotificationsProvider");
  return ctx;
}

