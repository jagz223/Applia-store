const EDIT_SERVICE_RETURN_KEY = "genfeb-edit-service-return";

function isSafeInternalPath(path: string): boolean {
  const p = path.trim();
  if (!p.startsWith("/") || p.startsWith("//")) return false;
  if (p.startsWith("/edit-service")) return false;
  return true;
}

/** Guarda la ruta actual (pathname + query) al abrir editar desde la pantalla en curso. */
export function storeEditServiceReturnPath(): void {
  if (typeof window === "undefined") return;
  const p = window.location.pathname + window.location.search;
  if (p.length > 0) setEditServiceReturnPath(p);
}

/** Guarda desde dónde se abrió «Editar servicio» (p. ej. /my-services o /service/32). */
export function setEditServiceReturnPath(path: string): void {
  if (typeof window === "undefined") return;
  try {
    const p = path.trim();
    if (!isSafeInternalPath(p)) return;
    sessionStorage.setItem(EDIT_SERVICE_RETURN_KEY, p);
  } catch {
    /* ignore */
  }
}

/** Lee y borra la ruta guardada; si no hay o no es válida, usa el fallback. */
export function consumeEditServiceReturnPath(fallback: string): string {
  if (typeof window === "undefined") return fallback;
  try {
    const stored = sessionStorage.getItem(EDIT_SERVICE_RETURN_KEY);
    sessionStorage.removeItem(EDIT_SERVICE_RETURN_KEY);
    if (stored && isSafeInternalPath(stored)) return stored;
  } catch {
    /* ignore */
  }
  return fallback;
}

export function editServiceReturnLabel(returnPath: string): string {
  const pathOnly = returnPath.split("?")[0] ?? returnPath;
  if (pathOnly === "/my-services") return "Volver a Mis servicios";
  if (/^\/service\/\d+$/.test(pathOnly)) return "Volver al servicio";
  if (pathOnly === "/professional-dashboard") return "Volver al panel";
  if (pathOnly.startsWith("/explore")) return "Volver a Explorar";
  if (pathOnly === "/chat" || pathOnly.startsWith("/chat?")) return "Volver al chat";
  return "Volver";
}
