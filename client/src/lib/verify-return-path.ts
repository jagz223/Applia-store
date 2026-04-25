const VERIFY_RETURN_KEY = "genfeb-verify-return";

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
    const p = path.trim() || "/professional-dashboard";
    sessionStorage.setItem(VERIFY_RETURN_KEY, p.startsWith("/professional/verify") ? "/professional-dashboard" : p);
  } catch {
    /* ignore */
  }
}

/** Guarda la ruta actual para volver tras terminar la verificación (no guarda si ya estás en /professional/verify). */
export function storeVerifyReturnPath(): void {
  if (typeof window === "undefined") return;
  const p = window.location.pathname + window.location.search;
  if (p.startsWith("/professional/verify")) return;
  sessionStorage.setItem(VERIFY_RETURN_KEY, p.length > 0 ? p : "/professional-dashboard");
}

/** Lee y borra la ruta guardada; por defecto panel de asociado. No devuelve rutas de verificación (evita bucles). */
export function consumeVerifyReturnPath(): string {
  if (typeof window === "undefined") return "/professional-dashboard";
  try {
    const v = sessionStorage.getItem(VERIFY_RETURN_KEY);
    sessionStorage.removeItem(VERIFY_RETURN_KEY);
    let path = v && v.length > 0 ? v : "/professional-dashboard";
    if (path.startsWith("/professional/verify")) path = "/professional-dashboard";
    return path;
  } catch {
    return "/professional-dashboard";
  }
}
