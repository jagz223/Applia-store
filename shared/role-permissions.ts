/**
 * Permisos granulares del catálogo de roles, agrupados por tipo de usuario.
 * - Opciones administrativas (colapsables hasta activar el interruptor maestro)
 * - Opciones de Asociado y Central
 * - Opciones de Cliente
 */

export type RolePermissionItem = {
  key: string;
  label: string;
  description?: string;
};

export type RolePermissionArea = {
  id: string;
  label: string;
  description?: string;
  permissions: RolePermissionItem[];
};

/** Activa la sección de permisos del panel admin (muestra el resto de casillas admin). */
export const ADMIN_SUITE_MASTER_KEY = "admin.suite.enabled" as const;

/** Bloques mostrados solo si ADMIN_SUITE_MASTER_KEY está marcado. */
export const ADMIN_PERMISSION_AREAS: RolePermissionArea[] = [
  {
    id: "administration",
    label: "Panel y cuentas",
    description: "Acceso al panel y gestión de usuarios y roles",
    permissions: [
      { key: "admin.panel", label: "Acceder al panel de administración" },
      { key: "admin.users.view", label: "Ver listado de usuarios" },
      { key: "admin.users.create", label: "Crear usuarios" },
      { key: "admin.users.edit", label: "Editar usuarios" },
      { key: "admin.roles.view", label: "Ver catálogo de roles" },
      { key: "admin.roles.create", label: "Crear roles" },
      { key: "admin.roles.edit", label: "Editar roles" },
    ],
  },
  {
    id: "operations",
    label: "Operación",
    description: "Asociados, reservas y resumen",
    permissions: [
      { key: "admin.overview", label: "Ver resumen general" },
      { key: "admin.providers.view", label: "Ver asociados" },
      {
        key: "admin.providers.verify",
        label: "Aprobar o rechazar verificación de asociados",
      },
      { key: "admin.bookings.view", label: "Ver reservas" },
    ],
  },
  {
    id: "finance",
    label: "Finanzas",
    permissions: [
      { key: "admin.stats", label: "Ver estadísticas financieras" },
      { key: "admin.recharges", label: "Gestionar recargas" },
      { key: "admin.balance", label: "Gestión de saldo masivo" },
      { key: "admin.payouts", label: "Gestionar retiros" },
    ],
  },
  {
    id: "catalog",
    label: "Catálogo y promociones",
    permissions: [
      { key: "admin.promo_codes", label: "Códigos promocionales" },
      { key: "admin.categories", label: "Categorías" },
      { key: "admin.services", label: "Servicios y marcas" },
    ],
  },
  {
    id: "settings",
    label: "Configuración",
    permissions: [
      { key: "admin.settings.view", label: "Ver configuración general" },
      { key: "admin.settings.edit", label: "Editar tarifas, comisiones y mensualidades" },
    ],
  },
];

export const ADMIN_PERMISSION_KEYS = [
  ADMIN_SUITE_MASTER_KEY,
  ...ADMIN_PERMISSION_AREAS.flatMap((a) => a.permissions.map((p) => p.key)),
] as const;

/** Asociado (profesional) y Central (empresa despachadora). */
export const ASSOCIATE_CENTRAL_PERMISSION_AREAS: RolePermissionArea[] = [
  {
    id: "professional",
    label: "Asociado / Profesional",
    description: "Proveedor de servicios en el marketplace",
    permissions: [
      { key: "associate.dashboard", label: "Panel de actividad del asociado" },
      { key: "associate.services.create", label: "Crear y publicar servicios" },
      { key: "associate.services.manage", label: "Gestionar mis servicios" },
      { key: "associate.bookings", label: "Gestionar reservas recibidas" },
      { key: "associate.verification", label: "Flujo de verificación de asociado" },
      { key: "associate.wallet", label: "Billetera, saldo y retiros del asociado" },
      { key: "associate.central.request", label: "Solicitar afiliación a una central (Go)" },
      { key: "associate.terms", label: "Aceptar términos de uso como proveedor" },
    ],
  },
  {
    id: "central",
    label: "Central",
    description: "Empresa despachadora de conductores",
    permissions: [
      { key: "central.panel", label: "Acceder al panel Central" },
      { key: "central.members.register", label: "Registrar operadores y conductores" },
      { key: "central.members.manage", label: "Ver y gestionar miembros de la empresa" },
      { key: "central.affiliation", label: "Aprobar o rechazar solicitudes de afiliación" },
      { key: "central.fleet", label: "Ver mapa y flota activa" },
      { key: "central.fares", label: "Configurar tarifas de la central" },
      { key: "central.active_services", label: "Ver servicios activos de la central" },
    ],
  },
];

export const ASSOCIATE_CENTRAL_PERMISSION_KEYS = [
  ...ASSOCIATE_CENTRAL_PERMISSION_AREAS.flatMap((a) => a.permissions.map((p) => p.key)),
] as const;

/** Cliente final (uso más simple). */
export const CLIENT_PERMISSION_AREA: RolePermissionArea = {
  id: "client",
  label: "Cliente",
  description: "Usuario que contrata servicios",
  permissions: [
    { key: "client.marketplace", label: "Explorar catálogo y buscar servicios" },
    { key: "client.bookings", label: "Crear y gestionar mis reservas" },
    { key: "client.chat", label: "Chat con proveedor en reservas" },
    { key: "client.profile", label: "Editar perfil y datos de cuenta" },
    { key: "client.wallet", label: "Billetera y pagos como cliente" },
    { key: "client.ratings", label: "Calificar servicios recibidos" },
  ],
};

export const CLIENT_PERMISSION_KEYS = [
  ...CLIENT_PERMISSION_AREA.permissions.map((p) => p.key),
] as const;

export const ALL_ROLE_PERMISSION_KEYS = [
  ...ADMIN_PERMISSION_KEYS,
  ...ASSOCIATE_CENTRAL_PERMISSION_KEYS,
  ...CLIENT_PERMISSION_KEYS,
] as const;

export type RolePermissionKey = (typeof ALL_ROLE_PERMISSION_KEYS)[number];

export type RolePermissionsMap = Partial<Record<RolePermissionKey, boolean>>;

export function isHiddenCatalogRoleCode(code: string | undefined | null): boolean {
  const c = String(code ?? "").trim().toLowerCase();
  return !c || c === "_seed" || c.startsWith("_");
}

export function emptyPermissionsMap(): Record<RolePermissionKey, boolean> {
  return Object.fromEntries(ALL_ROLE_PERMISSION_KEYS.map((k) => [k, false])) as Record<
    RolePermissionKey,
    boolean
  >;
}

function setAllKeys(
  base: Record<RolePermissionKey, boolean>,
  keys: readonly string[],
  value: boolean
): Record<RolePermissionKey, boolean> {
  const out = { ...base };
  for (const k of keys) {
    out[k as RolePermissionKey] = value;
  }
  return out;
}

export function allAdminPermissionsTrue(): Record<RolePermissionKey, boolean> {
  let out = emptyPermissionsMap();
  out[ADMIN_SUITE_MASTER_KEY] = true;
  out = setAllKeys(out, ADMIN_PERMISSION_KEYS.filter((k) => k !== ADMIN_SUITE_MASTER_KEY), true);
  return out;
}

/** La sección administrativa está activa (interruptor o algún permiso admin hijo). */
export function isAdminSuiteEnabled(
  permissions: Record<RolePermissionKey, boolean> | RolePermissionsMap
): boolean {
  if (permissions[ADMIN_SUITE_MASTER_KEY] === true) return true;
  return ADMIN_PERMISSION_KEYS.some(
    (k) => k !== ADMIN_SUITE_MASTER_KEY && permissions[k as RolePermissionKey] === true
  );
}

function professionalDefaults(base: Record<RolePermissionKey, boolean>) {
  return setAllKeys(base, ASSOCIATE_CENTRAL_PERMISSION_AREAS[0].permissions.map((p) => p.key), true);
}

function centralDefaults(base: Record<RolePermissionKey, boolean>) {
  return setAllKeys(base, ASSOCIATE_CENTRAL_PERMISSION_AREAS[1].permissions.map((p) => p.key), true);
}

function clientDefaults(base: Record<RolePermissionKey, boolean>) {
  return setAllKeys(base, CLIENT_PERMISSION_KEYS, true);
}

/** Permisos por defecto según código de rol de sistema. */
export function systemRolePermissions(code: string): Record<RolePermissionKey, boolean> {
  const base = emptyPermissionsMap();
  const c = code.trim().toLowerCase();

  if (c === "admin") {
    return allAdminPermissionsTrue();
  }

  if (c === "tisupport") {
    return {
      ...base,
      [ADMIN_SUITE_MASTER_KEY]: true,
      "admin.panel": true,
      "admin.users.view": true,
      "admin.users.create": true,
      "admin.users.edit": true,
      "admin.providers.view": true,
      "admin.bookings.view": true,
      "admin.settings.view": true,
    };
  }

  if (c === "professional") {
    return professionalDefaults(base);
  }

  if (c === "central") {
    return centralDefaults(base);
  }

  if (c === "client") {
    return clientDefaults(base);
  }

  return base;
}

export function resolveRolePermissions(
  roleCode: string,
  stored?: RolePermissionsMap | null
): Record<RolePermissionKey, boolean> {
  const code = roleCode.trim().toLowerCase();
  const base = systemRolePermissions(code);
  if (!stored || typeof stored !== "object") {
    return base;
  }
  const out = { ...base };
  for (const key of ALL_ROLE_PERMISSION_KEYS) {
    if (typeof stored[key] === "boolean") {
      out[key] = stored[key]!;
    }
  }
  return out;
}

export function hasRolePermission(
  permissions: Record<RolePermissionKey, boolean> | RolePermissionsMap | undefined,
  key: RolePermissionKey
): boolean {
  return permissions?.[key] === true;
}

function summarizeArea(area: RolePermissionArea, permissions: Record<RolePermissionKey, boolean>): string | null {
  const enabled = area.permissions.filter((p) => permissions[p.key as RolePermissionKey]).map((p) => p.label);
  if (enabled.length === 0) return null;
  return `${area.label}: ${enabled.slice(0, 3).join(", ")}${enabled.length > 3 ? "…" : ""}`;
}

/** Resumen legible para la tabla de roles (por bloque: admin, asociado/central, cliente). */
export function summarizeEnabledPermissions(
  permissions: Record<RolePermissionKey, boolean>
): string[] {
  const lines: string[] = [];

  if (isAdminSuiteEnabled(permissions)) {
    const adminLabels = ADMIN_PERMISSION_AREAS.flatMap((a) =>
      a.permissions.filter((p) => permissions[p.key as RolePermissionKey]).map((p) => p.label)
    );
    if (adminLabels.length > 0) {
      lines.push(`Administración (${adminLabels.length} permisos)`);
    } else {
      lines.push("Administración: sección activa sin permisos detallados");
    }
  }

  for (const area of ASSOCIATE_CENTRAL_PERMISSION_AREAS) {
    const line = summarizeArea(area, permissions);
    if (line) lines.push(line);
  }

  const clientLine = summarizeArea(CLIENT_PERMISSION_AREA, permissions);
  if (clientLine) lines.push(clientLine);

  return lines;
}

export function countEnabledPermissions(permissions: Record<RolePermissionKey, boolean>): number {
  return ALL_ROLE_PERMISSION_KEYS.filter((k) => permissions[k]).length;
}
