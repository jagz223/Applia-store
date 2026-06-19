import { useCallback, useEffect, useState } from "react";
import {
  getStoredFcmToken,
  isWebPushSupported,
  registerWebPush,
} from "@/lib/register-web-push";

type PushPermission = NotificationPermission | "unsupported";

type RegistrationState = {
  permission: PushPermission;
  token: string | null;
  isSupported: boolean;
  isRegistering: boolean;
  error: string | null;
  register: () => Promise<void>;
};

export function usePushNotifications(): RegistrationState {
  const [permission, setPermission] = useState<PushPermission>(() =>
    typeof Notification === "undefined" ? "unsupported" : Notification.permission
  );
  const [token, setToken] = useState<string | null>(() => getStoredFcmToken());
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState<boolean>(() => isWebPushSupported());

  useEffect(() => {
    if (!isWebPushSupported()) {
      setIsSupported(false);
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission);
  }, []);

  const register = useCallback(async () => {
    setError(null);
    setIsRegistering(true);
    try {
      const result = await registerWebPush({ requestPermission: true });
      setPermission(result.permission);
      setIsSupported(result.permission !== "unsupported");
      if (result.ok && result.token) {
        setToken(result.token);
        setError(null);
      } else {
        setError(result.error);
      }
    } finally {
      setIsRegistering(false);
    }
  }, []);

  return {
    permission,
    token,
    isSupported,
    isRegistering,
    error,
    register,
  };
}
