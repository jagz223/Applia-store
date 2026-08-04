import { hasAdminPrivileges, isFullAdmin } from "@shared/roles";
import { appliaStorage } from "./storage-applia";

/**
 * Admin o Soporte TI: siempre toma el rol desde la BD (fuente de verdad).
 * Evita 403 cuando el JWT está desactualizado o el rol tiene otra capitalización en Firestore.
 */
export function requireStaffFromDb(req: any, res: any, next: any): void {
  void (async () => {
    try {
      const id = req.user?.id as string | undefined;
      if (!id) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }
      const user = await appliaStorage.getUserById(id);
      if (!user) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }
      const role = (user as { role?: string }).role;
      req.user = { ...req.user, role };
      if (!hasAdminPrivileges(role)) {
        res.status(403).json({ message: "Se requiere rol de administrador o soporte TI" });
        return;
      }
      next();
    } catch (e) {
      next(e);
    }
  })();
}

/** Admin o Soporte TI: primero JWT; si falla, refresca desde BD. */
export function requireAdminStaff(req: any, res: any, next: any): void {
  if (hasAdminPrivileges(req.user?.role)) {
    next();
    return;
  }
  void (async () => {
    try {
      const id = req.user?.id as string | undefined;
      if (!id) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }
      const user = await appliaStorage.getUserById(id);
      if (!user) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }
      const role = (user as { role?: string }).role;
      req.user = { ...req.user, role };
      if (!hasAdminPrivileges(role)) {
        res.status(403).json({ message: "Se requiere rol de administrador o soporte TI" });
        return;
      }
      next();
    } catch (e) {
      next(e);
    }
  })();
}

/** Solo administrador: finanzas, verificación de asociados, recargas y retiros. */
export function requireFullAdmin(req: any, res: any, next: any): void {
  if (isFullAdmin(req.user?.role)) {
    next();
    return;
  }
  void (async () => {
    try {
      const id = req.user?.id as string | undefined;
      if (!id) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }
      const user = await appliaStorage.getUserById(id);
      if (!user) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }
      const role = (user as { role?: string }).role;
      req.user = { ...req.user, role };
      if (!isFullAdmin(role)) {
        res.status(403).json({ message: "Se requiere rol de administrador" });
        return;
      }
      next();
    } catch (e) {
      next(e);
    }
  })();
}
