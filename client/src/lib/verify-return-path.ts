const VERIFY_RETURN_KEY = "applia-verify-return";

export const VERIFY_PAYMENT_PATH = "/professional/verify/payment";

function sanitizeReturnPath(path: string): string {
  const p = path.trim() || "/professional-dashboard";
  if (p.startsWith("/professional/verify")) return "/professional-dashboard";
  return p;
}

/** Si no hay ruta guardada (p. ej. entró por URL), usar panel de asociado al terminar. */
export function ensureDefaultVerifyReturnPath(): void {
  if (typeof window === "undefined") return;
  try {
    if (!sessionStorage.getItem(VERIFY_RETURN_KEY)) {
      sessionStorage.setItem(VERIFY_RETURN_KEY, "/professional-dashboard");
    }
  } catch {
    /* ignore */
  }
}

/** Fija explícitamente la ruta de retorno tras la verificación (p. ej. al registrar asociado y enviar a `/professional/verify`). */
export function setVerifyReturnPath(path: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(VERIFY_RETURN_KEY, sanitizeReturnPath(path));
  } catch {
    /* ignore */
  }
}

/** Guarda la ruta actual para volver tras terminar la verificación (no guarda rutas de verificación/pago). */
export function storeVerifyReturnPath(): void {
  if (typeof window === "undefined") return;
  const p = window.location.pathname + window.location.search;
  if (p.startsWith("/professional/verify")) return;
  try {
    sessionStorage.setItem(VERIFY_RETURN_KEY, sanitizeReturnPath(p));
  } catch {
    /* ignore */
  }
}

/** Antes de abrir la pantalla de pago por renovación: recordar de dónde vino el usuario. */
export function prepareRenewalPaymentNavigation(): void {
  storeVerifyReturnPath();
  ensureDefaultVerifyReturnPath();
}

/** Ruta de retorno sin borrarla (p. ej. botón Atrás en pago de renovación). */
export function peekVerifyReturnPath(): string {
  if (typeof window === "undefined") return "/professional-dashboard";
  try {
    const v = sessionStorage.getItem(VERIFY_RETURN_KEY);
    return sanitizeReturnPath(v && v.length > 0 ? v : "/professional-dashboard");
  } catch {
    return "/professional-dashboard";
  }
}

/** Lee y borra la ruta guardada; por defecto panel de asociado. */
export function consumeVerifyReturnPath(): string {
  if (typeof window === "undefined") return "/professional-dashboard";
  try {
    const v = sessionStorage.getItem(VERIFY_RETURN_KEY);
    sessionStorage.removeItem(VERIFY_RETURN_KEY);
    return sanitizeReturnPath(v && v.length > 0 ? v : "/professional-dashboard");
  } catch {
    return "/professional-dashboard";
  }
}
