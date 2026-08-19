export const NOTIFICATION_TYPE_ROLE_CHANGED = "role_changed";

export const CENTRAL_SETUP_PATH = "/central/setup";

export function roleLabelEs(role: string): string {
  const r = role.trim().toLowerCase();
  const map: Record<string, string> = {
    client: "Cliente",
    employee: "Empleado",
    professional: "Profesional / asociado",
    central: "Central",
    admin: "Administrador",
    tisupport: "Soporte TI",
  };
  return map[r] ?? role;
}
