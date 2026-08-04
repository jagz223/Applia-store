import type { IStorage } from "./storage-applia";

const emptyFilters = { page: 1, limit: 100, name: "", email: "", lastName: "" } as const;

/**
 * Usuarios con rol admin o tiSupport, sin duplicar por id (p. ej. notificaciones push a todo el staff).
 */
export async function getAdminAndSupportUsers(storage: IStorage): Promise<any[]> {
  const [r1, r2] = await Promise.all([
    storage.getUsers({ role: "admin", ...emptyFilters }),
    storage.getUsers({ role: "tiSupport", ...emptyFilters }),
  ]);
  const byId = new Map<string, any>();
  for (const u of [...(r1.users ?? []), ...(r2.users ?? [])]) {
    const id = (u as { id?: string }).id;
    if (id) byId.set(String(id), u);
  }
  return Array.from(byId.values());
}

/** Solo usuarios con rol `admin` (notificaciones financieras / retiros / recargas). */
export async function getFullAdminUsers(storage: IStorage): Promise<any[]> {
  const r = await storage.getUsers({ role: "admin", ...emptyFilters });
  return r.users ?? [];
}
